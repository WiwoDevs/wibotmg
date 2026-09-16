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
export type FormatoResultado = 'resumen' | 'ranking' | 'serie' | 'tabla' | 'texto';

export interface Herramienta {
  nombre: string;
  titulo: string;
  descripcion: string;
  /** Shape de zod con los parámetros. Vacío si la herramienta no recibe nada. */
  esquema: z.ZodRawShape;
  formato: FormatoResultado;
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
      'Fotografía general de un período: cuántos cupones de servicio se emitieron y cuántos concesionarios, locales, asesores, clientes y vehículos distintos participaron, más el desglose por tipo de documento. Es la herramienta por defecto para preguntas del tipo "cómo va el día" o "cuántos cupones llevamos".',
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
      'Ejecuta un SELECT propio cuando ninguna otra herramienta alcanza: cruces raros, cálculos a medida, cohortes. Solo SELECT o WITH, una sentencia, sin escrituras y con LIMIT obligatorio. Antes de usarla, mirá el esquema con esquema_cupones.',
    esquema: {
      sql: z.string().min(10).describe('Sentencia SELECT o WITH, sin punto y coma final.'),
      limite: z.number().int().min(1).max(5000).optional().describe('Tope de filas.'),
    },
    formato: 'tabla',
    ejecutar: (argumentos) => {
      const limite = typeof argumentos.limite === 'number' ? Math.trunc(argumentos.limite) : undefined;
      return consultaLibre(String(argumentos.sql ?? ''), limite);
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
    titulo: 'Listar tablas',
    descripcion:
      'Tablas disponibles en la base con su volumen aproximado. La tabla de negocio es coupon_file_data; el resto es infraestructura de WordPress y WooCommerce.',
    esquema: {},
    formato: 'tabla',
    ejecutar: () => listarTablas(),
  },
  {
    nombre: 'describir_tabla',
    titulo: 'Describir una tabla',
    descripcion: 'Columnas, tipos y claves de cualquier tabla de la base.',
    esquema: { tabla: z.string().min(2).describe('Nombre de la tabla, con o sin prefijo.') },
    formato: 'tabla',
    ejecutar: (argumentos) => describirTabla(String(argumentos.tabla ?? '')),
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
  return HERRAMIENTAS.map((herramienta) => {
    const esquema = zodToJsonSchema(z.object(herramienta.esquema), { target: 'openApi3' }) as Record<string, unknown>;
    delete esquema.$schema;
    return {
      nombre: herramienta.nombre,
      descripcion: herramienta.descripcion,
      parametros: { type: 'object', properties: {}, ...esquema },
    };
  });
}
