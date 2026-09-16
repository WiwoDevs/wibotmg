#!/usr/bin/env node
/**
 * Importa los Excel de la carpeta data/ a un SQLite de negocio.
 *
 * Uso: npm run datos:importar [-- --datos <carpeta>] [--salida <archivo.sqlite>]
 *
 * Es idempotente: recrea cada tabla desde cero en cada corrida, así que se puede
 * volver a ejecutar cuando lleguen archivos nuevos sin duplicar filas.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), '..');

function leerArgumento(nombre, porDefecto) {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice !== -1 && process.argv[indice + 1] ? process.argv[indice + 1] : porDefecto;
}

const CARPETA_DATOS = resolve(RAIZ, leerArgumento('datos', 'data'));
const ARCHIVO_SALIDA = resolve(RAIZ, leerArgumento('salida', '.data/wibot-datos.sqlite'));

/** Normaliza texto: recorta, colapsa espacios y devuelve null si queda vacío. */
function texto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor.text === 'string') return texto(valor.text);
    if (Array.isArray(valor.richText)) return texto(valor.richText.map((t) => t.text).join(''));
    if (typeof valor.result !== 'undefined') return texto(valor.result);
    if (typeof valor.hyperlink === 'string') return texto(valor.hyperlink);
  }
  const limpio = String(valor).replace(/\s+/g, ' ').trim();
  return limpio === '' ? null : limpio;
}

/** Convierte a número, aceptando coma decimal. Devuelve null si no es numérico. */
function numero(valor) {
  const crudo = texto(valor);
  if (crudo === null) return null;
  const n = Number(crudo.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Convierte a número decimal sin quitar el punto (para notas tipo "6.0"). */
function decimal(valor) {
  const crudo = texto(valor);
  if (crudo === null) return null;
  const n = Number(crudo.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const MESES = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
};

/**
 * Normaliza a fecha ISO (YYYY-MM-DD) los formatos que aparecen en los Excel:
 * fechas reales, "2025-03-21 00:00:00" y "ago 22, 2026 06:14 pm".
 */
function fecha(valor) {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const crudo = texto(valor);
  if (crudo === null) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(crudo);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const español = /^([a-záéíóú]{3})\w*\s+(\d{1,2}),\s*(\d{4})/i.exec(crudo);
  if (español) {
    const mes = MESES[español[1].toLowerCase()];
    if (mes) return `${español[3]}-${mes}-${String(español[2]).padStart(2, '0')}`;
  }

  const barras = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(crudo);
  if (barras) {
    return `${barras[3]}-${String(barras[2]).padStart(2, '0')}-${String(barras[1]).padStart(2, '0')}`;
  }

  return null;
}

/** Normaliza a marca de tiempo ISO cuando el valor trae hora. */
function marcaTiempo(valor) {
  if (valor instanceof Date) return valor.toISOString().replace('T', ' ').slice(0, 19);
  const crudo = texto(valor);
  if (crudo === null) return null;
  const conHora = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/.exec(crudo);
  if (conHora) return `${conHora[1]} ${conHora[2].length === 5 ? `${conHora[2]}:00` : conHora[2]}`;
  const soloFecha = fecha(crudo);
  return soloFecha ? `${soloFecha} 00:00:00` : null;
}

/**
 * Convierte una duración a segundos. Acepta "00:01:34" y también el formato
 * con días que usa el informe de anexos: "1 day, 7:02:10".
 */
function segundos(valor) {
  // Excel guarda las duraciones como fecha serial desde el 30-12-1899, así que
  // una celda de "tiempo hablado" llega como Date de ese año.
  if (valor instanceof Date) {
    const epoca = Date.UTC(1899, 11, 30);
    const transcurrido = valor.getTime() - epoca;
    return transcurrido >= 0 && valor.getUTCFullYear() <= 1901 ? Math.round(transcurrido / 1000) : null;
  }

  const crudo = texto(valor);
  if (crudo === null) return null;

  let dias = 0;
  let resto = crudo;
  const conDias = /^(\d+)\s*days?,\s*(.+)$/i.exec(crudo);
  if (conDias) {
    dias = Number(conDias[1]);
    resto = conDias[2];
  }

  const partes = resto.split(':').map(Number);
  if (partes.some((p) => !Number.isFinite(p))) return null;
  if (partes.length === 3) return dias * 86400 + partes[0] * 3600 + partes[1] * 60 + partes[2];
  if (partes.length === 2) return dias * 86400 + partes[0] * 60 + partes[1];
  return null;
}

/** Interpreta "Sí"/"No" como 1/0. Cualquier otra cosa es null. */
function siNo(valor) {
  const crudo = texto(valor);
  if (crudo === null) return null;
  const normalizado = crudo.toLowerCase();
  if (normalizado.startsWith('s')) return 1;
  if (normalizado.startsWith('n')) return 0;
  return null;
}

/**
 * Quita el sufijo de conteo que agrega el informe de leads a los valores
 * agrupadores: "ago 1, 2026 ( 715 )" queda en "ago 1, 2026".
 */
function sinConteo(valor) {
  const crudo = texto(valor);
  if (crudo === null) return null;
  return texto(crudo.replace(/\(\s*\d+\s*\)\s*$/, ''));
}

/** Lee una hoja completa como arreglo de arreglos. */
async function leerHoja(ruta, filtroHoja) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hojas = [];
  libro.eachSheet((hoja) => {
    if (!filtroHoja || filtroHoja(hoja.name)) {
      const filas = [];
      hoja.eachRow({ includeEmpty: false }, (fila) => {
        const valores = fila.values;
        filas.push(Array.isArray(valores) ? valores.slice(1) : []);
      });
      hojas.push({ nombre: hoja.name, filas });
    }
  });
  return hojas;
}

/** Busca en la carpeta el primer archivo cuyo nombre contenga el fragmento. */
function buscarArchivo(fragmento) {
  if (!existsSync(CARPETA_DATOS)) return undefined;
  const nombre = readdirSync(CARPETA_DATOS).find(
    (archivo) => archivo.toLowerCase().includes(fragmento.toLowerCase()) && archivo.endsWith('.xlsx'),
  );
  return nombre ? join(CARPETA_DATOS, nombre) : undefined;
}

/** Lista todos los archivos cuyo nombre contenga el fragmento. */
function buscarArchivos(fragmento) {
  if (!existsSync(CARPETA_DATOS)) return [];
  return readdirSync(CARPETA_DATOS)
    .filter((archivo) => archivo.toLowerCase().includes(fragmento.toLowerCase()) && archivo.endsWith('.xlsx'))
    .map((archivo) => join(CARPETA_DATOS, archivo));
}

mkdirSync(dirname(ARCHIVO_SALIDA), { recursive: true });
const base = new DatabaseSync(ARCHIVO_SALIDA);
base.exec('PRAGMA journal_mode = WAL');

const resumen = [];

/** Crea la tabla desde cero e inserta todas las filas en una transacción. */
function poblar(nombreTabla, esquema, columnas, filas) {
  base.exec(`DROP TABLE IF EXISTS ${nombreTabla}`);
  base.exec(esquema);
  if (filas.length === 0) {
    resumen.push({ tabla: nombreTabla, filas: 0 });
    return;
  }
  const marcadores = columnas.map(() => '?').join(', ');
  const sentencia = base.prepare(
    `INSERT INTO ${nombreTabla} (${columnas.join(', ')}) VALUES (${marcadores})`,
  );
  base.exec('BEGIN');
  try {
    for (const fila of filas) sentencia.run(...fila);
    base.exec('COMMIT');
  } catch (error) {
    base.exec('ROLLBACK');
    throw error;
  }
  resumen.push({ tabla: nombreTabla, filas: filas.length });
}

// --------------------------------------------------------------- encuestas ---

async function importarEncuestas() {
  const ruta = buscarArchivo('Encuestas PosVenta');
  if (!ruta) {
    console.warn('  aviso: no encontré el Excel de encuestas de posventa');
    return;
  }

  const hojas = await leerHoja(ruta, (nombre) => nombre.toLowerCase().includes('encuesta'));
  const filas = [];

  for (const hoja of hojas) {
    for (const fila of hoja.filas.slice(1)) {
      const identrega = texto(fila[0]);
      const concesionario = texto(fila[1]);
      if (!identrega && !concesionario) continue;
      filas.push([
        identrega,
        concesionario,
        texto(fila[2]),
        texto(fila[3]),
        texto(fila[4]),
        texto(fila[5])?.toLowerCase() ?? null,
        texto(fila[6]),
        fecha(fila[7]),
        decimal(fila[8]),
        decimal(fila[9]),
        decimal(fila[10]),
        siNo(fila[11]),
        siNo(fila[12]),
        siNo(fila[13]),
        decimal(fila[14]),
        siNo(fila[15]),
        decimal(fila[16]),
        // La columna "Mes de encuesta" del Excel trae el mes sin año, así que
        // mezclaría 2025 con 2026: el período sale del nombre de la hoja.
        hoja.nombre.replace(/^Encuesta\s+/i, '').trim(),
        texto(fila[18]),
      ]);
    }
  }

  poblar(
    'encuestas',
    `CREATE TABLE encuestas (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       identrega TEXT, concesionario TEXT, sucursal TEXT,
       rut TEXT, nombre TEXT, email TEXT, celular TEXT,
       fecha TEXT,
       nota_sucursal REAL, nota_tiempo_espera REAL, nota_entrega REAL,
       explico_trabajos INTEGER, cumplio_fecha INTEGER, vehiculo_limpio INTEGER,
       nota_satisfaccion REAL, regreso_taller INTEGER, nota_recomendacion REAL,
       mes_encuesta TEXT, vin TEXT
     )`,
    ['identrega', 'concesionario', 'sucursal', 'rut', 'nombre', 'email', 'celular', 'fecha',
     'nota_sucursal', 'nota_tiempo_espera', 'nota_entrega', 'explico_trabajos', 'cumplio_fecha',
     'vehiculo_limpio', 'nota_satisfaccion', 'regreso_taller', 'nota_recomendacion', 'mes_encuesta', 'vin'],
    filas,
  );
  base.exec('CREATE INDEX idx_encuestas_fecha ON encuestas(fecha)');
  base.exec('CREATE INDEX idx_encuestas_concesionario ON encuestas(concesionario)');
}

// ------------------------------------------------------- envíos de encuesta ---

async function importarEnvios() {
  const rutas = buscarArchivos('stats_delivered');
  const filas = [];

  for (const ruta of rutas) {
    const campania = ruta.split('/').pop().replace(/\.xlsx$/i, '');
    const hojas = await leerHoja(ruta);
    for (const hoja of hojas) {
      for (const fila of hoja.filas.slice(1)) {
        const contacto = texto(fila[0]);
        if (!contacto) continue;
        filas.push([
          contacto,
          texto(fila[1]),
          texto(fila[2])?.toLowerCase() ?? null,
          texto(fila[3]),
          fecha(fila[4]),
          campania,
        ]);
      }
    }
  }

  poblar(
    'encuestas_envios',
    `CREATE TABLE encuestas_envios (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       contacto_id TEXT, nombre TEXT, email TEXT,
       estado TEXT, fecha TEXT, campania TEXT
     )`,
    ['contacto_id', 'nombre', 'email', 'estado', 'fecha', 'campania'],
    filas,
  );
}

// ------------------------------------------------------------------- leads ---

async function importarLeads() {
  const ruta = buscarArchivo('Leads');
  if (!ruta) {
    console.warn('  aviso: no encontré el Excel de leads');
    return;
  }

  const [hoja] = await leerHoja(ruta);
  if (!hoja) return;

  // El informe trae un encabezado decorativo: la fila de columnas es la que
  // contiene "Nombre" y "Concesionario".
  const indiceCabecera = hoja.filas.findIndex(
    (fila) => fila.some((c) => texto(c) === 'Nombre') && fila.some((c) => texto(c) === 'Concesionario'),
  );
  if (indiceCabecera === -1) {
    console.warn('  aviso: no encontré la fila de columnas en el informe de leads');
    return;
  }

  const cabecera = hoja.filas[indiceCabecera].map((c) => texto(c));
  const columna = (nombre) => cabecera.indexOf(nombre);

  // Las tres primeras columnas son agrupadores: el informe solo las escribe en
  // la primera fila de cada grupo, así que hay que arrastrarlas hacia abajo.
  const AGRUPADORES = ['Hora de creación', 'Origen del candidato', 'Estado de Posible cliente'];
  const arrastre = new Map();
  const filas = [];

  for (const fila of hoja.filas.slice(indiceCabecera + 1)) {
    const nombre = texto(fila[columna('Nombre')]);
    const idRegistro = texto(fila[columna('ID de registro')]);
    if (!nombre && !idRegistro) continue;

    for (const agrupador of AGRUPADORES) {
      const indice = columna(agrupador);
      if (indice === -1) continue;
      const valor = sinConteo(fila[indice]);
      if (valor !== null) arrastre.set(agrupador, valor);
    }

    const leer = (nombreColumna) => {
      const indice = columna(nombreColumna);
      return indice === -1 ? null : texto(fila[indice]);
    };

    filas.push([
      fecha(arrastre.get('Hora de creación')),
      arrastre.get('Origen del candidato') ?? null,
      arrastre.get('Estado de Posible cliente') ?? null,
      nombre,
      leer('Apellidos'),
      leer('Número ID'),
      leer('Correo electrónico')?.toLowerCase() ?? null,
      leer('Teléfono'),
      leer('Móvil'),
      leer('Género'),
      leer('Dueño del lead'),
      leer('se ha convertido') === 'True' ? 1 : 0,
      leer('Código de Campaña'),
      idRegistro,
      leer('Código PDV'),
      leer('Punto de Venta'),
      leer('Concesionario'),
      leer('Categoría'),
      leer('utm_origen'),
      leer('utm_medio'),
      leer('utm_campaña'),
      marcaTiempo(leer('Fecha asignación')),
      marcaTiempo(leer('Fecha inicio seguimiento')),
      numero(leer('Días hasta inicio seguimiento')),
      leer('Fuente del lead detallada'),
      leer('No Gestionado') === 'True' ? 1 : 0,
      leer('Descripción'),
      leer('Versión de interés'),
      leer('Modelo de interés'),
      leer('Valoración'),
    ]);
  }

  poblar(
    'leads',
    `CREATE TABLE leads (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       fecha TEXT, origen TEXT, estado TEXT,
       nombre TEXT, apellidos TEXT, rut TEXT, email TEXT, telefono TEXT, movil TEXT, genero TEXT,
       dueno TEXT, convertido INTEGER, codigo_campania TEXT, id_registro TEXT,
       codigo_pdv TEXT, punto_venta TEXT, concesionario TEXT, categoria TEXT,
       utm_origen TEXT, utm_medio TEXT, utm_campania TEXT,
       fecha_asignacion TEXT, fecha_inicio_seguimiento TEXT, dias_hasta_seguimiento REAL,
       fuente_detallada TEXT, no_gestionado INTEGER,
       descripcion TEXT, version_interes TEXT, modelo_interes TEXT, valoracion TEXT
     )`,
    ['fecha', 'origen', 'estado', 'nombre', 'apellidos', 'rut', 'email', 'telefono', 'movil', 'genero',
     'dueno', 'convertido', 'codigo_campania', 'id_registro', 'codigo_pdv', 'punto_venta', 'concesionario',
     'categoria', 'utm_origen', 'utm_medio', 'utm_campania', 'fecha_asignacion', 'fecha_inicio_seguimiento',
     'dias_hasta_seguimiento', 'fuente_detallada', 'no_gestionado', 'descripcion', 'version_interes',
     'modelo_interes', 'valoracion'],
    filas,
  );
  base.exec('CREATE INDEX idx_leads_fecha ON leads(fecha)');
  base.exec('CREATE INDEX idx_leads_valoracion ON leads(valoracion)');
  base.exec('CREATE INDEX idx_leads_concesionario ON leads(concesionario)');
}

// --------------------------------------------------------------- llamadas ---

async function importarLlamadas() {
  const ruta = buscarArchivo('call_reports');
  if (!ruta) {
    console.warn('  aviso: no encontré call_reports.xlsx');
    return;
  }

  const [hoja] = await leerHoja(ruta);
  if (!hoja) return;

  const filas = [];
  for (const fila of hoja.filas.slice(1)) {
    const marca = marcaTiempo(fila[0]);
    const idLlamada = texto(fila[1]);
    if (!marca && !idLlamada) continue;
    // El informe cierra con una fila de totales, sin dirección ni estado.
    if (!texto(fila[4]) && !texto(fila[5])) continue;
    filas.push([
      marca,
      marca ? marca.slice(0, 10) : null,
      idLlamada,
      texto(fila[2]),
      texto(fila[3]),
      texto(fila[4]),
      texto(fila[5]),
      segundos(fila[6]),
      segundos(fila[7]),
      decimal(fila[8]),
      texto(fila[9]),
      texto(fila[10]),
      texto(fila[11]),
      texto(fila[12]),
    ]);
  }

  poblar(
    'llamadas',
    `CREATE TABLE llamadas (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       momento TEXT, fecha TEXT, llamada_id TEXT,
       origen TEXT, destino TEXT, direccion TEXT, estado TEXT,
       segundos_timbrando INTEGER, segundos_hablando INTEGER, costo REAL,
       detalle TEXT, sentimiento TEXT, resumen TEXT, transcripcion TEXT
     )`,
    ['momento', 'fecha', 'llamada_id', 'origen', 'destino', 'direccion', 'estado',
     'segundos_timbrando', 'segundos_hablando', 'costo', 'detalle', 'sentimiento', 'resumen', 'transcripcion'],
    filas,
  );
  base.exec('CREATE INDEX idx_llamadas_fecha ON llamadas(fecha)');
  base.exec('CREATE INDEX idx_llamadas_direccion ON llamadas(direccion)');
}

// ----------------------------------------------------------------- anexos ---

async function importarAnexos() {
  const ruta = buscarArchivo('extension_statistics');
  if (!ruta) {
    console.warn('  aviso: no encontré extension_statistics_by_group.xlsx');
    return;
  }

  const [hoja] = await leerHoja(ruta);
  if (!hoja) return;

  const filas = [];
  for (const fila of hoja.filas.slice(1)) {
    const anexo = texto(fila[0]);
    // La última fila del informe es el total general, no un anexo más.
    if (!anexo || anexo.toLowerCase() === 'totals') continue;
    filas.push([
      anexo.replace(/\.0$/, ''),
      numero(fila[1]) ?? 0,
      numero(fila[2]) ?? 0,
      numero(fila[3]) ?? 0,
      numero(fila[4]) ?? 0,
      numero(fila[5]) ?? 0,
      numero(fila[6]) ?? 0,
      segundos(fila[7]) ?? 0,
      texto(fila[8]),
    ]);
  }

  poblar(
    'anexos',
    `CREATE TABLE anexos (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       anexo TEXT,
       entrantes_atendidas INTEGER, entrantes_perdidas INTEGER,
       salientes_atendidas INTEGER, salientes_perdidas INTEGER,
       total_atendidas INTEGER, total_perdidas INTEGER,
       segundos_hablando INTEGER, sentimiento TEXT
     )`,
    ['anexo', 'entrantes_atendidas', 'entrantes_perdidas', 'salientes_atendidas', 'salientes_perdidas',
     'total_atendidas', 'total_perdidas', 'segundos_hablando', 'sentimiento'],
    filas,
  );
}

console.log(`Leyendo Excel de ${CARPETA_DATOS}`);

await importarEncuestas();
await importarEnvios();
await importarLeads();
await importarLlamadas();
await importarAnexos();

base.exec(`CREATE TABLE IF NOT EXISTS importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ocurrido_en TEXT NOT NULL, detalle TEXT NOT NULL
)`);
base
  .prepare('INSERT INTO importaciones (ocurrido_en, detalle) VALUES (?, ?)')
  .run(new Date().toISOString(), JSON.stringify(resumen));

console.log(`\nSQLite escrito en ${ARCHIVO_SALIDA}`);
for (const { tabla, filas } of resumen) {
  console.log(`  ${tabla.padEnd(20)} ${String(filas).padStart(7)} filas`);
}
base.close();
