import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  buscarCliente,
  historialVehiculo,
  ranking,
  resumenOperacion,
  serieTemporal,
  valoresDimension,
  type Dimension,
  type FiltrosCupones,
} from './consultas.js';
import { consultaLibre } from './consulta-libre.js';
import { consultaLibreGestion } from './gestion-consulta-libre.js';
import { estadoBaseGestion, TABLAS_GESTION } from './gestion-catalogo.js';
import {
  analizarEncuestas,
  analizarLeads,
  analizarLlamadas,
  buscarLead,
  buscarLlamadas,
  listarAnexos,
  type EjeEncuestas,
  type EjeLeads,
  type EjeLlamadas,
} from './gestion-consultas.js';
import { describirTabla, listarTablas, DICCIONARIO_CUPONES, TABLA_CUPONES } from './catalogo.js';
import { obtenerConfiguracion } from './config.js';
import type { EntradaPeriodo, PeriodoRelativo } from './fechas.js';

const periodoShape = {
  periodo: z
    .enum(['hoy', 'ayer', 'ultimos_7_dias', 'ultimos_30_dias', 'mes_actual', 'mes_anterior', 'anio_actual', 'todo'])
    .optional()
    .describe('Período relativo. Por defecto "mes_actual".'),
  desde: z.string().optional().describe('Fecha inicial YYYY-MM-DD. Tiene prioridad sobre "periodo".'),
  hasta: z.string().optional().describe('Fecha final YYYY-MM-DD.'),
};

/** Igual que periodoShape, pero diciendo el valor por defecto de la base de gestión. */
const periodoShapeGestion = {
  periodo: z
    .enum(['hoy', 'ayer', 'ultimos_7_dias', 'ultimos_30_dias', 'mes_actual', 'mes_anterior', 'anio_actual', 'todo'])
    .optional()
    .describe('Período relativo. Por defecto el histórico completo, que es lo que conviene acá.'),
  desde: z.string().optional().describe('Fecha inicial YYYY-MM-DD. Tiene prioridad sobre "periodo".'),
  hasta: z.string().optional().describe('Fecha final YYYY-MM-DD.'),
};

const filtrosShape = {
  concesionario: z.string().optional().describe('Concesionario, por ejemplo "Salazar Israel". Coincidencia parcial.'),
  local: z.string().optional().describe('Sucursal. Coincidencia parcial.'),
  asesor: z.string().optional().describe('Nombre del asesor. Coincidencia parcial.'),
  tipoDocumento: z.string().optional().describe('Mantenimiento, Mecánica, D&P, Garantía u Otro.'),
  familia: z.string().optional().describe('Familia del modelo, por ejemplo "MG ZS".'),
  region: z.string().optional().describe('Región del cliente.'),
};

const dimensionSchema = z
  .enum(['concesionario', 'local', 'asesor', 'tipoDocumento', 'familia', 'modelo', 'region', 'comuna'])
  .describe('Eje por el que se agrupa.');

type Argumentos = Record<string, unknown>;

function extraerPeriodo(argumentos: Argumentos): EntradaPeriodo {
  const entrada: EntradaPeriodo = {};
  if (typeof argumentos.periodo === 'string') entrada.relativo = argumentos.periodo as PeriodoRelativo;
  if (typeof argumentos.desde === 'string' && argumentos.desde !== '') entrada.desde = argumentos.desde;
  if (typeof argumentos.hasta === 'string' && argumentos.hasta !== '') entrada.hasta = argumentos.hasta;
  return entrada;
}

/**
 * Período para las herramientas de gestión. Si la persona no pidió uno, se usa
 * el histórico completo: los leads y las llamadas cargados son de un solo mes,
 * y con el mes en curso por defecto toda consulta salía vacía.
 */
function extraerPeriodoGestion(argumentos: Argumentos): EntradaPeriodo {
  const entrada = extraerPeriodo(argumentos);
  const sinPeriodo = entrada.relativo === undefined && entrada.desde === undefined && entrada.hasta === undefined;
  return sinPeriodo ? { relativo: 'todo' } : entrada;
}

function extraerFiltros(argumentos: Argumentos): FiltrosCupones {
  const claves = ['concesionario', 'local', 'asesor', 'tipoDocumento', 'familia', 'region'] as const;
  const filtros: FiltrosCupones = {};
  for (const clave of claves) {
    const valor = argumentos[clave];
    if (typeof valor === 'string' && valor.trim() !== '') filtros[clave] = valor;
  }
  return filtros;
}

function entero(valor: unknown, porDefecto: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? Math.trunc(valor) : porDefecto;
}

/** Forma de presentación sugerida para el resultado de una herramienta. */
export type FormatoResultado =
  | 'resumen'
  | 'ranking'
  | 'serie'
  | 'tabla'
  | 'texto'
  | 'encuestas'
  | 'leads'
  | 'llamadas';

export interface Herramienta {
  nombre: string;
  titulo: string;
  descripcion: string;
  /** Shape de zod con los parámetros. Vacío si la herramienta no recibe nada. */
  esquema: z.ZodRawShape;
  formato: FormatoResultado;
  /**
   * true cuando la herramienta sirve para inspeccionar la base desde un cliente
   * MCP, pero no debe ofrecerse en el chat: son respuestas técnicas que no
   * responden preguntas de negocio y desvían la conversación.
   */
  soloMcp?: boolean;
  ejecutar: (argumentos: Argumentos) => Promise<unknown>;
}

/**
 * Registro único de herramientas de WiBot.
 * Lo consumen tanto el servidor MCP como la API del chat web, para que
 * las dos superficies expongan exactamente las mismas capacidades.
 */
export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'resumen_operacion',
    titulo: 'Resumen de la operación',
    descripcion:
      'Volumen de la operación de taller en un período: cuántos cupones de servicio se emitieron y cuántos concesionarios, locales, asesores, clientes y vehículos distintos participaron, más el desglose por tipo de documento. Cubre solo la posventa: para preguntas de negocio o de "cómo vamos" es el complemento, no el punto de partida, que es leads.',
    esquema: { ...periodoShape, ...filtrosShape },
    formato: 'resumen',
    ejecutar: (argumentos) => resumenOperacion(extraerPeriodo(argumentos), extraerFiltros(argumentos)),
  },
  {
    nombre: 'ranking',
    titulo: 'Ranking por dimensión',
    descripcion:
      'Ordena asesores, locales, concesionarios, familias, modelos, regiones o comunas por volumen de cupones en un período. Responde "quién gestionó más", "qué local lidera", "qué modelo se atiende más".',
    esquema: {
      dimension: dimensionSchema,
      limite: z.number().int().min(1).max(100).optional().describe('Cantidad de filas. Por defecto 10.'),
      ...periodoShape,
      ...filtrosShape,
    },
    formato: 'ranking',
    ejecutar: (argumentos) =>
      ranking(
        argumentos.dimension as Dimension,
        extraerPeriodo(argumentos),
        extraerFiltros(argumentos),
        entero(argumentos.limite, 10),
      ),
  },
  {
    nombre: 'serie_temporal',
    titulo: 'Evolución en el tiempo',
    descripcion:
      'Serie de cupones por día, semana o mes dentro de un período. Sirve para tendencias, comparaciones y para detectar caídas o picos.',
    esquema: {
      granularidad: z.enum(['dia', 'semana', 'mes']).optional().describe('Por defecto "dia".'),
      ...periodoShape,
      ...filtrosShape,
    },
    formato: 'serie',
    ejecutar: (argumentos) =>
      serieTemporal(
        (argumentos.granularidad as 'dia' | 'semana' | 'mes') ?? 'dia',
        extraerPeriodo(argumentos),
        extraerFiltros(argumentos),
      ),
  },
  {
    nombre: 'valores_dimension',
    titulo: 'Valores reales de una dimensión',
    descripcion:
      'Lista los valores que existen de verdad en la base para una dimensión (concesionarios, locales, asesores, familias...). Usala antes de filtrar, para no inventar nombres que no existen.',
    esquema: {
      dimension: dimensionSchema,
      limite: z.number().int().min(1).max(200).optional().describe('Cantidad de valores. Por defecto 50.'),
    },
    formato: 'tabla',
    ejecutar: (argumentos) => valoresDimension(argumentos.dimension as Dimension, entero(argumentos.limite, 50)),
  },
  {
    nombre: 'buscar_cliente',
    titulo: 'Buscar cliente',
    descripcion:
      'Búsqueda puntual de clientes por RUT, nombre, razón social, correo o teléfono, con su cantidad de atenciones, última visita y vehículos. Devuelve datos personales: usala solo cuando la persona pide un cliente concreto, nunca para listados masivos.',
    esquema: {
      texto: z.string().min(3).describe('RUT, nombre, correo o teléfono. Mínimo 3 caracteres.'),
      limite: z.number().int().min(1).max(50).optional().describe('Cantidad de clientes. Por defecto 10.'),
    },
    formato: 'tabla',
    ejecutar: async (argumentos) => {
      const resultado = await buscarCliente(String(argumentos.texto ?? ''), entero(argumentos.limite, 10));
      return { clientes: resultado.filas, columnasEnmascaradas: resultado.columnasEnmascaradas };
    },
  },
  {
    nombre: 'historial_vehiculo',
    titulo: 'Historial de un vehículo',
    descripcion:
      'Atenciones de un vehículo buscado por patente o VIN, ordenadas de la más reciente a la más antigua, con local, asesor, kilometraje y descripción del trabajo.',
    esquema: {
      identificador: z.string().min(4).describe('Patente o VIN, completo o parcial. Mínimo 4 caracteres.'),
      limite: z.number().int().min(1).max(100).optional().describe('Cantidad de atenciones. Por defecto 20.'),
    },
    formato: 'tabla',
    ejecutar: async (argumentos) => {
      const resultado = await historialVehiculo(
        String(argumentos.identificador ?? ''),
        entero(argumentos.limite, 20),
      );
      return { atenciones: resultado.filas, columnasEnmascaradas: resultado.columnasEnmascaradas };
    },
  },
  {
    nombre: 'consulta_sql',
    titulo: 'Consulta SQL de solo lectura',
    descripcion:
      'Ejecuta un SELECT propio cuando ninguna otra herramienta alcanza: cruces raros, cálculos a medida, cohortes. Solo SELECT o WITH, una sentencia, sin escrituras y con LIMIT obligatorio. Elegí la base con "fuente" y mirá antes su esquema: esquema_cupones para los cupones (MariaDB), esquema_gestion para encuestas, leads y llamadas (SQLite).',
    esquema: {
      sql: z.string().min(10).describe('Sentencia SELECT o WITH, sin punto y coma final.'),
      fuente: z
        .enum(['cupones', 'gestion'])
        .optional()
        .describe('"cupones" (por defecto) o "gestion" para encuestas, leads, llamadas y anexos.'),
      limite: z.number().int().min(1).max(5000).optional().describe('Tope de filas.'),
    },
    formato: 'tabla',
    ejecutar: (argumentos) => {
      const limite = typeof argumentos.limite === 'number' ? Math.trunc(argumentos.limite) : undefined;
      const sql = String(argumentos.sql ?? '');
      if (argumentos.fuente === 'gestion') {
        return Promise.resolve(consultaLibreGestion(sql, limite));
      }
      return consultaLibre(sql, limite);
    },
  },
  {
    nombre: 'esquema_cupones',
    titulo: 'Esquema de la tabla de cupones',
    descripcion:
      'Diccionario de la tabla principal de cupones: nombre real, columnas, tipos, significado de negocio y qué columnas son datos personales. Consultala antes de escribir SQL propio.',
    esquema: {},
    formato: 'texto',
    ejecutar: async () => {
      const { db, modoPrivacidad, limiteFilas } = obtenerConfiguracion();
      return {
        tabla: `${db.prefijoTablas}${TABLA_CUPONES}`,
        base: db.database,
        modoPrivacidad,
        limiteFilas,
        notasDeCalidad: [
          'FechaCreacion es la fecha de referencia para "hoy", "ayer" y "este mes".',
          'Familia y Modelo vienen sucios: conviven "MG_ZS" y "MG ZS". Normalizá con REPLACE(UPPER(TRIM(col)), \'_\', \' \').',
          'TipoEvento tiene valores basura (correos, entidades HTML); casi todo es "Cupón Servicio".',
          'Hay filas con NombreConcesionario vacío: excluilas con NULLIF(TRIM(col), \'\') IS NOT NULL.',
        ],
        columnas: await describirTabla(TABLA_CUPONES),
        glosario: DICCIONARIO_CUPONES,
      };
    },
  },
  {
    nombre: 'listar_tablas',
    soloMcp: true,
    titulo: 'Listar tablas',
    descripcion:
      'Tablas disponibles en la base con su volumen aproximado. La tabla de negocio es coupon_file_data; el resto es infraestructura de WordPress y WooCommerce.',
    esquema: {},
    formato: 'tabla',
    ejecutar: () => listarTablas(),
  },
  {
    nombre: 'describir_tabla',
    soloMcp: true,
    titulo: 'Describir una tabla',
    descripcion: 'Columnas, tipos y claves de cualquier tabla de la base.',
    esquema: { tabla: z.string().min(2).describe('Nombre de la tabla, con o sin prefijo.') },
    formato: 'tabla',
    ejecutar: (argumentos) => describirTabla(String(argumentos.tabla ?? '')),
  },
  {
    nombre: 'encuestas_posventa',
    titulo: 'Encuestas de posventa',
    descripcion:
      'Satisfacción de los clientes después de un servicio: promedio de cada nota (1 a 7), NPS y porcentaje de respuestas afirmativas, agrupado por concesionario, sucursal o mes. Responde "cómo nos evalúan", "qué sucursal tiene peor nota", "cómo viene el NPS".',
    esquema: {
      agrupar_por: z
        .enum(['concesionario', 'sucursal', 'mes', 'total'])
        .optional()
        .describe('Eje del análisis. Por defecto "concesionario".'),
      concesionario: z.string().optional().describe('Filtra por concesionario. Coincidencia parcial.'),
      sucursal: z.string().optional().describe('Filtra por sucursal. Coincidencia parcial.'),
      limite: z.number().int().min(1).max(100).optional().describe('Cantidad de filas. Por defecto 20.'),
      ...periodoShapeGestion,
    },
    formato: 'encuestas',
    ejecutar: async (argumentos) => {
      const filtros: { concesionario?: string; sucursal?: string } = {};
      if (typeof argumentos.concesionario === 'string') filtros.concesionario = argumentos.concesionario;
      if (typeof argumentos.sucursal === 'string') filtros.sucursal = argumentos.sucursal;
      return analizarEncuestas(
        (argumentos.agrupar_por as EjeEncuestas) ?? 'concesionario',
        extraerPeriodoGestion(argumentos),
        filtros,
        entero(argumentos.limite, 20),
      );
    },
  },
  {
    nombre: 'leads',
    titulo: 'Leads del CRM',
    descripcion:
      'Lo comercial: leads del CRM con su temperatura (Super Caliente, Caliente, Tibio, Frío) y su conversión en venta, agrupados por valoración, concesionario, punto de venta, modelo de interés, estado, origen o vendedor. Es la herramienta por defecto para preguntas de negocio: "cómo vamos", "cuántos leads calientes hay", "qué punto de venta recibe más", "cuántos se convirtieron".',
    esquema: {
      agrupar_por: z
        .enum(['valoracion', 'concesionario', 'punto_venta', 'modelo_interes', 'estado', 'origen', 'utm_origen', 'dueno', 'fecha', 'total'])
        .optional()
        .describe('Eje del análisis. Por defecto "valoracion".'),
      valoracion: z.string().optional().describe('Filtra por temperatura: Super Caliente, Caliente, Tibio o Frío.'),
      concesionario: z.string().optional().describe('Filtra por concesionario. Coincidencia parcial.'),
      punto_venta: z.string().optional().describe('Filtra por punto de venta. Coincidencia parcial.'),
      estado: z.string().optional().describe('Filtra por estado del CRM.'),
      modelo_interes: z.string().optional().describe('Filtra por modelo de interés.'),
      limite: z.number().int().min(1).max(100).optional().describe('Cantidad de filas. Por defecto 20.'),
      ...periodoShapeGestion,
    },
    formato: 'leads',
    ejecutar: async (argumentos) => {
      const claves = ['valoracion', 'concesionario', 'punto_venta', 'estado', 'modelo_interes'] as const;
      const filtros: Record<string, string> = {};
      for (const clave of claves) {
        const valor = argumentos[clave];
        if (typeof valor === 'string' && valor.trim() !== '') filtros[clave] = valor;
      }
      return analizarLeads(
        (argumentos.agrupar_por as EjeLeads) ?? 'valoracion',
        extraerPeriodoGestion(argumentos),
        filtros,
        entero(argumentos.limite, 20),
      );
    },
  },
  {
    nombre: 'buscar_lead',
    titulo: 'Buscar un lead',
    descripcion:
      'Búsqueda puntual de leads por nombre, RUT, correo o teléfono, con su vendedor, estado, temperatura y las notas del seguimiento. Devuelve datos personales: usala solo para un lead concreto.',
    esquema: {
      texto: z.string().min(3).describe('Nombre, RUT, correo o teléfono. Mínimo 3 caracteres.'),
      limite: z.number().int().min(1).max(50).optional().describe('Cantidad de leads. Por defecto 10.'),
    },
    formato: 'tabla',
    ejecutar: async (argumentos) => {
      const resultado = buscarLead(String(argumentos.texto ?? ''), entero(argumentos.limite, 10));
      return { leads: resultado.filas, columnasEnmascaradas: resultado.columnasEnmascaradas };
    },
  },
  {
    nombre: 'llamadas',
    titulo: 'Telefonía',
    descripcion:
      'Registro de la central telefónica: volumen de llamadas, tasa de atención, minutos hablados y costo, agrupado por dirección (entrantes o salientes), estado, día, origen o destino.',
    esquema: {
      agrupar_por: z
        .enum(['direccion', 'estado', 'fecha', 'origen', 'destino', 'total'])
        .optional()
        .describe('Eje del análisis. Por defecto "direccion".'),
      direccion: z.string().optional().describe('Filtra por Inbound, Outbound o Inbound Queue.'),
      estado: z.string().optional().describe('Filtra por Answered, Unanswered o Waiting.'),
      limite: z.number().int().min(1).max(100).optional().describe('Cantidad de filas. Por defecto 20.'),
      ...periodoShapeGestion,
    },
    formato: 'llamadas',
    ejecutar: async (argumentos) => {
      const filtros: { direccion?: string; estado?: string } = {};
      if (typeof argumentos.direccion === 'string') filtros.direccion = argumentos.direccion;
      if (typeof argumentos.estado === 'string') filtros.estado = argumentos.estado;
      return analizarLlamadas(
        (argumentos.agrupar_por as EjeLlamadas) ?? 'direccion',
        extraerPeriodoGestion(argumentos),
        filtros,
        entero(argumentos.limite, 20),
      );
    },
  },
  {
    nombre: 'buscar_llamadas',
    titulo: 'Buscar llamadas',
    descripcion:
      'Busca llamadas por número, o por texto dentro del resumen o de la transcripción. Devuelve el contenido de conversaciones: usala solo para un caso concreto.',
    esquema: {
      texto: z.string().min(3).describe('Número, o palabras del resumen o la transcripción.'),
      limite: z.number().int().min(1).max(50).optional().describe('Cantidad de llamadas. Por defecto 15.'),
    },
    formato: 'tabla',
    ejecutar: async (argumentos) => {
      const resultado = buscarLlamadas(String(argumentos.texto ?? ''), entero(argumentos.limite, 15));
      return { llamadas: resultado.filas, columnasEnmascaradas: resultado.columnasEnmascaradas };
    },
  },
  {
    nombre: 'anexos_telefonia',
    titulo: 'Anexos telefónicos',
    descripcion:
      'Estadísticas acumuladas por anexo o agente: atendidas y perdidas, entrantes y salientes, y minutos hablados. Responde "qué anexo pierde más llamadas".',
    esquema: {
      limite: z.number().int().min(1).max(200).optional().describe('Cantidad de anexos. Por defecto 50.'),
    },
    formato: 'tabla',
    ejecutar: async (argumentos) => listarAnexos(entero(argumentos.limite, 50)),
  },
  {
    nombre: 'esquema_gestion',
    titulo: 'Esquema de la base de gestión',
    descripcion:
      'Diccionario de las tablas de encuestas de posventa, leads del CRM, llamadas y anexos, con el significado de cada columna y cuántas filas hay. Consultalo antes de escribir SQL con fuente "gestion".',
    esquema: {},
    formato: 'texto',
    ejecutar: async () => {
      const estado = estadoBaseGestion();
      if (!estado.disponible) {
        return {
          disponible: false,
          mensaje: 'La base de gestión todavía no fue generada. Corré: npm run datos:importar',
        };
      }
      return {
        disponible: true,
        ultimaImportacion: estado.ultimaImportacion,
        volumen: estado.tablas,
        notasDeCalidad: [
          'Las notas de encuesta van de 1 a 7. El NPS se calcula con 7 como promotor, 6 pasivo y 5 o menos detractor.',
          'Los leads del informe actual son todos de agosto de 2026; no hay histórico más largo.',
          'La columna sentimiento de llamadas y anexos viene vacía en los datos actuales.',
          'Una llamada puede tener varios tramos con el mismo llamada_id.',
        ],
        tablas: TABLAS_GESTION,
      };
    },
  },
];

/** Busca una herramienta por su nombre. */
export function obtenerHerramienta(nombre: string): Herramienta | undefined {
  return HERRAMIENTAS.find((herramienta) => herramienta.nombre === nombre);
}

export interface HerramientaJsonSchema {
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
}

/**
 * Traduce el registro de herramientas al formato JSON Schema que espera
 * la API de chat compatible con OpenAI (Gemini incluido).
 */
export function herramientasComoJsonSchema(): HerramientaJsonSchema[] {
  return HERRAMIENTAS.filter((herramienta) => herramienta.soloMcp !== true).map((herramienta) => {
    const esquema = zodToJsonSchema(z.object(herramienta.esquema), { target: 'openApi3' }) as Record<string, unknown>;
    delete esquema.$schema;
    return {
      nombre: herramienta.nombre,
      descripcion: herramienta.descripcion,
      parametros: { type: 'object', properties: {}, ...esquema },
    };
  });
}
