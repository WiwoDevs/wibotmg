import { consultarGestion } from './gestion-base.js';
import { resolverPeriodo, type EntradaPeriodo, type Periodo } from './fechas.js';
import { aplicarPolitica } from './privacidad.js';

/** Rango que abarca todo el histórico, el sensato para estas tablas. */
const TODO: EntradaPeriodo = { relativo: 'todo' };

interface Condiciones {
  sql: string;
  parametros: unknown[];
}

/** Arma la cláusula WHERE con el período y los filtros de texto indicados. */
function construirCondiciones(
  periodo: Periodo,
  filtros: Record<string, string | undefined>,
  columnaFecha = 'fecha',
): Condiciones {
  const partes = [`${columnaFecha} BETWEEN ? AND ?`];
  const parametros: unknown[] = [periodo.desde, periodo.hasta];

  for (const [columna, valor] of Object.entries(filtros)) {
    if (valor && valor.trim() !== '') {
      partes.push(`${columna} LIKE ? COLLATE NOCASE`);
      parametros.push(`%${valor.trim()}%`);
    }
  }

  return { sql: partes.join(' AND '), parametros };
}

/** Acota un límite al rango permitido. */
function acotar(limite: number | undefined, porDefecto: number, maximo: number): number {
  return Math.min(Math.max(Math.trunc(limite ?? porDefecto) || porDefecto, 1), maximo);
}

// ------------------------------------------------------------- encuestas ---

/** Ejes por los que se puede abrir el análisis de encuestas. */
export type EjeEncuestas = 'concesionario' | 'sucursal' | 'mes' | 'total';

const COLUMNA_EJE_ENCUESTAS: Record<EjeEncuestas, string> = {
  // Se agrupa en mayúsculas porque el origen mezcla "Forcenter" con "FORCENTER";
  // la etiqueta se devuelve después con formato legible.
  concesionario: "UPPER(NULLIF(TRIM(concesionario), ''))",
  sucursal: "UPPER(NULLIF(TRIM(sucursal), ''))",
  mes: 'mes_encuesta',
  total: "'Total'",
};

/**
 * Devuelve un nombre propio legible. El origen escribe el mismo concesionario
 * como "Forcenter", "FORCENTER" y hasta "CíRCULO", así que se normaliza entero
 * en vez de confiar en cómo venía escrito.
 *
 * @example formatearNombre('SALAZAR ISRAEL') // 'Salazar Israel'
 */
function formatearNombre(valor: string): string {
  // Cada palabra en mayúscula inicial: acá "La Florida" y "Mall Plaza" son parte
  // del nombre del local, no partículas que deban ir en minúscula.
  return valor
    .toLowerCase()
    .split(' ')
    .filter((palabra) => palabra !== '')
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
}

/** Ejes cuyas etiquetas son nombres propios y se muestran con formato legible. */
const EJES_DE_NOMBRE_PROPIO = new Set(['concesionario', 'sucursal', 'punto_venta', 'dueno']);

/** Aplica el formato de nombre propio solo donde corresponde. */
function etiquetaLegible(valor: string | null, eje: string): string {
  if (!valor) return 'sin dato';
  return EJES_DE_NOMBRE_PROPIO.has(eje) ? formatearNombre(valor) : valor;
}

export interface FilaEncuestas {
  etiqueta: string;
  respuestas: number;
  satisfaccion: number | null;
  recomendacion: number | null;
  sucursal: number | null;
  tiempoEspera: number | null;
  entrega: number | null;
  nps: number | null;
  promotores: number;
  detractores: number;
  porcentajeExplicoTrabajos: number | null;
  porcentajeCumplioFecha: number | null;
  porcentajeVehiculoLimpio: number | null;
  porcentajeRegresoTaller: number | null;
}

export interface AnalisisEncuestas {
  periodo: Periodo;
  eje: EjeEncuestas;
  /** Cómo se calcula el NPS sobre una escala de 1 a 7. */
  notaSobreNps: string;
  filas: FilaEncuestas[];
}

interface FilaEncuestasCruda {
  etiqueta: string | null;
  respuestas: number;
  satisfaccion: number | null;
  recomendacion: number | null;
  sucursal: number | null;
  tiempo_espera: number | null;
  entrega: number | null;
  promotores: number;
  detractores: number;
  con_recomendacion: number;
  explico: number | null;
  cumplio: number | null;
  limpio: number | null;
  regreso: number | null;
}

function porcentaje(valor: number | null): number | null {
  return valor === null ? null : Number((valor * 100).toFixed(1));
}

function redondear(valor: number | null): number | null {
  return valor === null ? null : Number(valor.toFixed(2));
}

/**
 * Analiza las encuestas de posventa: promedio de cada nota, NPS y porcentaje
 * de respuestas afirmativas, agrupado por el eje pedido.
 *
 * Con una escala de 1 a 7 se cuenta promotor al que responde 7, pasivo al 6 y
 * detractor de 5 para abajo.
 *
 * @param eje cómo agrupar: concesionario, sucursal, mes o total.
 * @param entradaPeriodo período; por defecto el histórico completo.
 * @param filtros recortes por concesionario o sucursal.
 * @param limite cantidad de filas a devolver.
 */
export function analizarEncuestas(
  eje: EjeEncuestas = 'concesionario',
  entradaPeriodo: EntradaPeriodo = TODO,
  filtros: { concesionario?: string; sucursal?: string } = {},
  limite = 20,
): AnalisisEncuestas {
  const columna = COLUMNA_EJE_ENCUESTAS[eje];
  if (!columna) throw new Error(`Eje no soportado para encuestas: ${eje}`);

  const periodo = resolverPeriodo(entradaPeriodo);
  const condiciones = construirCondiciones(periodo, filtros);
  const tope = acotar(limite, 20, 100);

  const filas = consultarGestion<FilaEncuestasCruda>(
    `SELECT ${columna} AS etiqueta,
            COUNT(*) AS respuestas,
            AVG(nota_satisfaccion) AS satisfaccion,
            AVG(nota_recomendacion) AS recomendacion,
            AVG(nota_sucursal) AS sucursal,
            AVG(nota_tiempo_espera) AS tiempo_espera,
            AVG(nota_entrega) AS entrega,
            SUM(CASE WHEN nota_recomendacion >= 7 THEN 1 ELSE 0 END) AS promotores,
            SUM(CASE WHEN nota_recomendacion <= 5 THEN 1 ELSE 0 END) AS detractores,
            SUM(CASE WHEN nota_recomendacion IS NOT NULL THEN 1 ELSE 0 END) AS con_recomendacion,
            AVG(explico_trabajos) AS explico,
            AVG(cumplio_fecha) AS cumplio,
            AVG(vehiculo_limpio) AS limpio,
            AVG(regreso_taller) AS regreso
       FROM encuestas
      WHERE ${condiciones.sql}
      GROUP BY etiqueta
     HAVING etiqueta IS NOT NULL
      ORDER BY respuestas DESC
      LIMIT ${tope}`,
    condiciones.parametros,
  );

  return {
    periodo,
    eje,
    notaSobreNps:
      'Escala 1 a 7: promotor responde 7, pasivo 6, detractor 5 o menos. El NPS es un índice de -100 a 100, no un porcentaje: escribilo como "NPS 61", nunca como "61%".',
    filas: filas.map((fila) => {
      const base = Number(fila.con_recomendacion) || 0;
      const promotores = Number(fila.promotores) || 0;
      const detractores = Number(fila.detractores) || 0;
      return {
        etiqueta: etiquetaLegible(fila.etiqueta, eje),
        respuestas: Number(fila.respuestas),
        satisfaccion: redondear(fila.satisfaccion),
        recomendacion: redondear(fila.recomendacion),
        sucursal: redondear(fila.sucursal),
        tiempoEspera: redondear(fila.tiempo_espera),
        entrega: redondear(fila.entrega),
        nps: base === 0 ? null : Number((((promotores - detractores) / base) * 100).toFixed(1)),
        promotores,
        detractores,
        porcentajeExplicoTrabajos: porcentaje(fila.explico),
        porcentajeCumplioFecha: porcentaje(fila.cumplio),
        porcentajeVehiculoLimpio: porcentaje(fila.limpio),
        porcentajeRegresoTaller: porcentaje(fila.regreso),
      };
    }),
  };
}

// ----------------------------------------------------------------- leads ---

/** Ejes por los que se puede abrir el análisis de leads. */
export type EjeLeads =
  | 'valoracion'
  | 'concesionario'
  | 'punto_venta'
  | 'modelo_interes'
  | 'estado'
  | 'origen'
  | 'utm_origen'
  | 'dueno'
  | 'fecha'
  | 'total';

const COLUMNA_EJE_LEADS: Record<EjeLeads, string> = {
  valoracion: 'valoracion',
  concesionario: "UPPER(NULLIF(TRIM(concesionario), ''))",
  punto_venta: "NULLIF(TRIM(punto_venta), '')",
  modelo_interes: "UPPER(REPLACE(NULLIF(TRIM(modelo_interes), ''), ' ', ''))",
  estado: 'estado',
  origen: 'origen',
  utm_origen: "NULLIF(TRIM(utm_origen), '')",
  dueno: "NULLIF(TRIM(dueno), '')",
  fecha: 'fecha',
  total: "'Total'",
};

export interface FilaLeads {
  etiqueta: string;
  leads: number;
  superCalientes: number;
  calientes: number;
  tibios: number;
  frios: number;
  convertidos: number;
  noGestionados: number;
  porcentajeConversion: number | null;
  diasPromedioHastaSeguimiento: number | null;
}

export interface AnalisisLeads {
  periodo: Periodo;
  eje: EjeLeads;
  total: number;
  filas: FilaLeads[];
}

interface FilaLeadsCruda {
  etiqueta: string | null;
  leads: number;
  super_calientes: number;
  calientes: number;
  tibios: number;
  frios: number;
  convertidos: number;
  no_gestionados: number;
  dias: number | null;
}

/**
 * Analiza los leads del CRM: cuántos hay por eje, cómo se reparte su
 * temperatura y qué proporción se convirtió.
 *
 * @param eje cómo agrupar: valoración, concesionario, punto de venta, modelo, etc.
 * @param entradaPeriodo período; por defecto el histórico completo.
 * @param filtros recortes por valoración, concesionario, punto de venta, estado o modelo.
 * @param limite cantidad de filas a devolver.
 */
export function analizarLeads(
  eje: EjeLeads = 'valoracion',
  entradaPeriodo: EntradaPeriodo = TODO,
  filtros: {
    valoracion?: string;
    concesionario?: string;
    punto_venta?: string;
    estado?: string;
    modelo_interes?: string;
  } = {},
  limite = 20,
): AnalisisLeads {
  const columna = COLUMNA_EJE_LEADS[eje];
  if (!columna) throw new Error(`Eje no soportado para leads: ${eje}`);

  const periodo = resolverPeriodo(entradaPeriodo);
  const condiciones = construirCondiciones(periodo, filtros);
  const tope = acotar(limite, 20, 100);

  const filas = consultarGestion<FilaLeadsCruda>(
    `SELECT ${columna} AS etiqueta,
            COUNT(*) AS leads,
            SUM(CASE WHEN valoracion = 'Super Caliente' THEN 1 ELSE 0 END) AS super_calientes,
            SUM(CASE WHEN valoracion = 'Caliente' THEN 1 ELSE 0 END) AS calientes,
            SUM(CASE WHEN valoracion = 'Tibio' THEN 1 ELSE 0 END) AS tibios,
            SUM(CASE WHEN valoracion = 'Frío' THEN 1 ELSE 0 END) AS frios,
            SUM(COALESCE(convertido, 0)) AS convertidos,
            SUM(COALESCE(no_gestionado, 0)) AS no_gestionados,
            AVG(dias_hasta_seguimiento) AS dias
       FROM leads
      WHERE ${condiciones.sql}
      GROUP BY etiqueta
     HAVING etiqueta IS NOT NULL
      ORDER BY leads DESC
      LIMIT ${tope}`,
    condiciones.parametros,
  );

  const total = filas.reduce((suma, fila) => suma + Number(fila.leads), 0);

  return {
    periodo,
    eje,
    total,
    filas: filas.map((fila) => {
      const leads = Number(fila.leads);
      const convertidos = Number(fila.convertidos) || 0;
      return {
        etiqueta: etiquetaLegible(fila.etiqueta, eje),
        leads,
        superCalientes: Number(fila.super_calientes) || 0,
        calientes: Number(fila.calientes) || 0,
        tibios: Number(fila.tibios) || 0,
        frios: Number(fila.frios) || 0,
        convertidos,
        noGestionados: Number(fila.no_gestionados) || 0,
        porcentajeConversion: leads === 0 ? null : Number(((convertidos / leads) * 100).toFixed(1)),
        diasPromedioHastaSeguimiento: redondear(fila.dias),
      };
    }),
  };
}

/**
 * Busca leads concretos por nombre, RUT, correo o teléfono.
 * Es una búsqueda puntual: devuelve datos personales.
 *
 * @param texto término con al menos 3 caracteres.
 * @param limite cantidad máxima de leads.
 * @throws {Error} si el término es demasiado corto.
 */
export function buscarLead(texto: string, limite = 10) {
  const termino = (texto ?? '').trim();
  if (termino.length < 3) {
    throw new Error('El término de búsqueda debe tener al menos 3 caracteres');
  }
  const tope = acotar(limite, 10, 50);
  const patron = `%${termino}%`;

  const filas = consultarGestion<Record<string, unknown>>(
    `SELECT fecha, nombre, apellidos, rut, email, telefono, movil,
            concesionario, punto_venta, dueno, estado, valoracion,
            modelo_interes, version_interes, origen, utm_origen, descripcion,
            convertido, no_gestionado, dias_hasta_seguimiento
       FROM leads
      WHERE nombre LIKE ? COLLATE NOCASE
         OR apellidos LIKE ? COLLATE NOCASE
         OR rut LIKE ?
         OR email LIKE ? COLLATE NOCASE
         OR telefono LIKE ?
         OR movil LIKE ?
      ORDER BY fecha DESC
      LIMIT ${tope}`,
    [patron, patron, patron, patron, patron, patron],
  );

  return aplicarPolitica(filas, { busquedaPuntual: true });
}

// -------------------------------------------------------------- llamadas ---

/** Ejes por los que se puede abrir el análisis de llamadas. */
export type EjeLlamadas = 'direccion' | 'estado' | 'fecha' | 'origen' | 'destino' | 'total';

const COLUMNA_EJE_LLAMADAS: Record<EjeLlamadas, string> = {
  direccion: 'direccion',
  estado: 'estado',
  fecha: 'fecha',
  origen: 'origen',
  destino: 'destino',
  total: "'Total'",
};

export interface FilaLlamadas {
  etiqueta: string;
  llamadas: number;
  atendidas: number;
  sinAtender: number;
  porcentajeAtencion: number | null;
  minutosHablados: number;
  segundosPromedioEspera: number | null;
  costo: number;
}

export interface AnalisisLlamadas {
  periodo: Periodo;
  eje: EjeLlamadas;
  filas: FilaLlamadas[];
}

interface FilaLlamadasCruda {
  etiqueta: string | null;
  llamadas: number;
  atendidas: number;
  sin_atender: number;
  segundos_hablando: number | null;
  espera: number | null;
  costo: number | null;
}

/**
 * Analiza el registro telefónico: volumen, tasa de atención, minutos hablados
 * y costo, agrupado por el eje pedido.
 *
 * @param eje cómo agrupar: dirección, estado, fecha, origen, destino o total.
 * @param entradaPeriodo período; por defecto el histórico completo.
 * @param filtros recortes por dirección o estado.
 * @param limite cantidad de filas a devolver.
 */
export function analizarLlamadas(
  eje: EjeLlamadas = 'direccion',
  entradaPeriodo: EntradaPeriodo = TODO,
  filtros: { direccion?: string; estado?: string } = {},
  limite = 20,
): AnalisisLlamadas {
  const columna = COLUMNA_EJE_LLAMADAS[eje];
  if (!columna) throw new Error(`Eje no soportado para llamadas: ${eje}`);

  const periodo = resolverPeriodo(entradaPeriodo);
  const condiciones = construirCondiciones(periodo, filtros);
  const tope = acotar(limite, 20, 100);

  const filas = consultarGestion<FilaLlamadasCruda>(
    `SELECT ${columna} AS etiqueta,
            COUNT(*) AS llamadas,
            SUM(CASE WHEN estado = 'Answered' THEN 1 ELSE 0 END) AS atendidas,
            SUM(CASE WHEN estado = 'Unanswered' THEN 1 ELSE 0 END) AS sin_atender,
            SUM(COALESCE(segundos_hablando, 0)) AS segundos_hablando,
            AVG(segundos_timbrando) AS espera,
            SUM(COALESCE(costo, 0)) AS costo
       FROM llamadas
      WHERE ${condiciones.sql}
      GROUP BY etiqueta
     HAVING etiqueta IS NOT NULL
      ORDER BY llamadas DESC
      LIMIT ${tope}`,
    condiciones.parametros,
  );

  return {
    periodo,
    eje,
    filas: filas.map((fila) => {
      const llamadas = Number(fila.llamadas);
      const atendidas = Number(fila.atendidas) || 0;
      return {
        etiqueta: fila.etiqueta ?? 'sin dato',
        llamadas,
        atendidas,
        sinAtender: Number(fila.sin_atender) || 0,
        porcentajeAtencion: llamadas === 0 ? null : Number(((atendidas / llamadas) * 100).toFixed(1)),
        minutosHablados: Math.round((Number(fila.segundos_hablando) || 0) / 60),
        segundosPromedioEspera: fila.espera === null ? null : Math.round(Number(fila.espera)),
        costo: Number((Number(fila.costo) || 0).toFixed(2)),
      };
    }),
  };
}

/**
 * Busca llamadas por número, por texto del resumen o de la transcripción.
 * Es una búsqueda puntual: devuelve contenido de conversaciones.
 *
 * @param texto término con al menos 3 caracteres.
 * @param limite cantidad máxima de llamadas.
 * @throws {Error} si el término es demasiado corto.
 */
export function buscarLlamadas(texto: string, limite = 15) {
  const termino = (texto ?? '').trim();
  if (termino.length < 3) {
    throw new Error('El término de búsqueda debe tener al menos 3 caracteres');
  }
  const tope = acotar(limite, 15, 50);
  const patron = `%${termino}%`;

  const filas = consultarGestion<Record<string, unknown>>(
    `SELECT momento, direccion, estado, origen, destino,
            segundos_hablando, costo, resumen, transcripcion
       FROM llamadas
      WHERE origen LIKE ?
         OR destino LIKE ?
         OR resumen LIKE ? COLLATE NOCASE
         OR transcripcion LIKE ? COLLATE NOCASE
      ORDER BY momento DESC
      LIMIT ${tope}`,
    [patron, patron, patron, patron],
  );

  return aplicarPolitica(filas, { busquedaPuntual: true });
}

export interface FilaAnexo {
  anexo: string;
  entrantesAtendidas: number;
  entrantesPerdidas: number;
  salientesAtendidas: number;
  salientesPerdidas: number;
  totalAtendidas: number;
  totalPerdidas: number;
  minutosHablados: number;
  porcentajeAtencion: number | null;
}

/**
 * Estadísticas acumuladas por anexo telefónico, ordenadas por volumen atendido.
 * @param limite cantidad de anexos a devolver.
 */
export function listarAnexos(limite = 50): FilaAnexo[] {
  const tope = acotar(limite, 50, 200);
  const filas = consultarGestion<Record<string, number | string>>(
    `SELECT anexo, entrantes_atendidas, entrantes_perdidas, salientes_atendidas,
            salientes_perdidas, total_atendidas, total_perdidas, segundos_hablando
       FROM anexos
      ORDER BY total_atendidas DESC, total_perdidas DESC
      LIMIT ${tope}`,
  );

  return filas.map((fila) => {
    const atendidas = Number(fila.total_atendidas) || 0;
    const perdidas = Number(fila.total_perdidas) || 0;
    const total = atendidas + perdidas;
    return {
      anexo: String(fila.anexo),
      entrantesAtendidas: Number(fila.entrantes_atendidas) || 0,
      entrantesPerdidas: Number(fila.entrantes_perdidas) || 0,
      salientesAtendidas: Number(fila.salientes_atendidas) || 0,
      salientesPerdidas: Number(fila.salientes_perdidas) || 0,
      totalAtendidas: atendidas,
      totalPerdidas: perdidas,
      minutosHablados: Math.round((Number(fila.segundos_hablando) || 0) / 60),
      porcentajeAtencion: total === 0 ? null : Number(((atendidas / total) * 100).toFixed(1)),
    };
  });
}
