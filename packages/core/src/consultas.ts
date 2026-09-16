import type { RowDataPacket } from 'mysql2/promise';
import { EXPRESIONES_NORMALIZADAS, TABLA_CUPONES, tabla } from './catalogo.js';
import { ejecutarSelect } from './pool.js';
import { aplicarPolitica } from './privacidad.js';
import { resolverPeriodo, type EntradaPeriodo, type Periodo } from './fechas.js';

/** Filtros que puede aplicar cualquier consulta agregada. */
export interface FiltrosCupones {
  concesionario?: string;
  local?: string;
  asesor?: string;
  tipoDocumento?: string;
  familia?: string;
  region?: string;
}

interface Condiciones {
  sql: string;
  parametros: unknown[];
}

/**
 * Traduce los filtros de negocio a una cláusula WHERE parametrizada.
 * Las comparaciones de texto son parciales e insensibles a mayúsculas,
 * porque los nombres llegan escritos de muchas formas distintas.
 */
function construirCondiciones(periodo: Periodo, filtros: FiltrosCupones = {}): Condiciones {
  const partes = ['FechaCreacion BETWEEN ? AND ?'];
  const parametros: unknown[] = [periodo.desde, periodo.hasta];

  const textuales: Array<[keyof FiltrosCupones, string]> = [
    ['concesionario', 'NombreConcesionario'],
    ['local', 'NombreLocal'],
    ['asesor', 'Asesor'],
    ['tipoDocumento', 'TipoDocumento'],
    ['region', 'NombreRegion'],
  ];

  for (const [clave, columna] of textuales) {
    const valor = filtros[clave];
    if (valor && valor.trim() !== '') {
      partes.push(`${columna} LIKE ?`);
      parametros.push(`%${valor.trim()}%`);
    }
  }

  if (filtros.familia && filtros.familia.trim() !== '') {
    partes.push(`${EXPRESIONES_NORMALIZADAS.familia} LIKE ?`);
    parametros.push(`%${filtros.familia.trim().toUpperCase().replace(/_/g, ' ')}%`);
  }

  return { sql: partes.join(' AND '), parametros };
}

export interface ResumenOperacion {
  periodo: Periodo;
  cupones: number;
  concesionarios: number;
  locales: number;
  asesores: number;
  clientes: number;
  vehiculos: number;
  kilometrajePromedio: number | null;
  porTipoDocumento: Array<{ tipoDocumento: string; cupones: number }>;
}

interface FilaResumen extends RowDataPacket {
  cupones: number;
  concesionarios: number;
  locales: number;
  asesores: number;
  clientes: number;
  vehiculos: number;
  km_promedio: number | null;
}

interface FilaConteo extends RowDataPacket {
  etiqueta: string | null;
  cupones: number;
}

/**
 * Fotografía general de la operación en un período: volumen de cupones y
 * cuántos actores distintos participaron.
 *
 * @param entradaPeriodo período relativo o rango explícito de fechas.
 * @param filtros recortes opcionales por concesionario, local, asesor, etc.
 */
export async function resumenOperacion(
  entradaPeriodo: EntradaPeriodo = {},
  filtros: FiltrosCupones = {},
): Promise<ResumenOperacion> {
  const periodo = resolverPeriodo(entradaPeriodo);
  const condiciones = construirCondiciones(periodo, filtros);
  const tablaCupones = tabla(TABLA_CUPONES);

  const { filas } = await ejecutarSelect<FilaResumen>(
    `SELECT COUNT(*) AS cupones,
            COUNT(DISTINCT ${EXPRESIONES_NORMALIZADAS.concesionario}) AS concesionarios,
            COUNT(DISTINCT ${EXPRESIONES_NORMALIZADAS.local}) AS locales,
            COUNT(DISTINCT ${EXPRESIONES_NORMALIZADAS.asesor}) AS asesores,
            COUNT(DISTINCT NULLIF(RutCliente, '')) AS clientes,
            COUNT(DISTINCT NULLIF(Vin, '')) AS vehiculos,
            ROUND(AVG(NULLIF(KM, 0))) AS km_promedio
       FROM ${tablaCupones}
      WHERE ${condiciones.sql}`,
    condiciones.parametros,
    1,
  );

  const { filas: porTipo } = await ejecutarSelect<FilaConteo>(
    `SELECT NULLIF(TRIM(TipoDocumento), '') AS etiqueta, COUNT(*) AS cupones
       FROM ${tablaCupones}
      WHERE ${condiciones.sql}
      GROUP BY etiqueta
      HAVING etiqueta IS NOT NULL
      ORDER BY cupones DESC`,
    condiciones.parametros,
    20,
  );

  const resumen = filas[0];

  return {
    periodo,
    cupones: Number(resumen?.cupones ?? 0),
    concesionarios: Number(resumen?.concesionarios ?? 0),
    locales: Number(resumen?.locales ?? 0),
    asesores: Number(resumen?.asesores ?? 0),
    clientes: Number(resumen?.clientes ?? 0),
    vehiculos: Number(resumen?.vehiculos ?? 0),
    kilometrajePromedio: resumen?.km_promedio === null || resumen?.km_promedio === undefined
      ? null
      : Number(resumen.km_promedio),
    porTipoDocumento: porTipo.map((fila) => ({
      tipoDocumento: fila.etiqueta ?? 'sin dato',
      cupones: Number(fila.cupones),
    })),
  };
}

/** Dimensiones por las que se puede abrir un ranking o una distribución. */
export type Dimension =
  | 'concesionario'
  | 'local'
  | 'asesor'
  | 'tipoDocumento'
  | 'familia'
  | 'modelo'
  | 'region'
  | 'comuna';

const EXPRESION_POR_DIMENSION: Record<Dimension, string> = {
  concesionario: EXPRESIONES_NORMALIZADAS.concesionario,
  local: EXPRESIONES_NORMALIZADAS.local,
  asesor: EXPRESIONES_NORMALIZADAS.asesor,
  tipoDocumento: "NULLIF(TRIM(TipoDocumento), '')",
  familia: EXPRESIONES_NORMALIZADAS.familia,
  modelo: EXPRESIONES_NORMALIZADAS.modelo,
  region: "NULLIF(TRIM(NombreRegion), '')",
  comuna: "NULLIF(TRIM(Comuna), '')",
};

export interface FilaRanking {
  etiqueta: string;
  cupones: number;
  clientes: number;
  participacion: number;
}

export interface Ranking {
  periodo: Periodo;
  dimension: Dimension;
  total: number;
  filas: FilaRanking[];
}

interface FilaRankingCruda extends RowDataPacket {
  etiqueta: string | null;
  cupones: number;
  clientes: number;
}

/**
 * Ordena una dimensión del negocio por volumen de cupones en el período.
 *
 * @param dimension eje del ranking: asesor, local, concesionario, familia, etc.
 * @param entradaPeriodo período relativo o rango explícito.
 * @param filtros recortes opcionales.
 * @param limite cantidad de filas a devolver, entre 1 y 100.
 */
export async function ranking(
  dimension: Dimension,
  entradaPeriodo: EntradaPeriodo = {},
  filtros: FiltrosCupones = {},
  limite = 10,
): Promise<Ranking> {
  const expresion = EXPRESION_POR_DIMENSION[dimension];
  if (!expresion) throw new Error(`Dimensión no soportada: ${dimension}`);

  const tope = Math.min(Math.max(Math.trunc(limite) || 10, 1), 100);
  const periodo = resolverPeriodo(entradaPeriodo);
  const condiciones = construirCondiciones(periodo, filtros);

  const { filas } = await ejecutarSelect<FilaRankingCruda>(
    `SELECT ${expresion} AS etiqueta,
            COUNT(*) AS cupones,
            COUNT(DISTINCT NULLIF(RutCliente, '')) AS clientes
       FROM ${tabla(TABLA_CUPONES)}
      WHERE ${condiciones.sql}
      GROUP BY etiqueta
     HAVING etiqueta IS NOT NULL
      ORDER BY cupones DESC
      LIMIT ${tope}`,
    condiciones.parametros,
    tope,
  );

  const total = filas.reduce((suma, fila) => suma + Number(fila.cupones), 0);

  return {
    periodo,
    dimension,
    total,
    filas: filas.map((fila) => ({
      etiqueta: fila.etiqueta ?? 'sin dato',
      cupones: Number(fila.cupones),
      clientes: Number(fila.clientes),
      participacion: total === 0 ? 0 : Number(((Number(fila.cupones) / total) * 100).toFixed(1)),
    })),
  };
}

/** Granularidades disponibles para la serie temporal. */
export type Granularidad = 'dia' | 'semana' | 'mes';

const FORMATO_POR_GRANULARIDAD: Record<Granularidad, string> = {
  dia: "DATE_FORMAT(FechaCreacion, '%Y-%m-%d')",
  semana: "DATE_FORMAT(FechaCreacion, '%x-W%v')",
  mes: "DATE_FORMAT(FechaCreacion, '%Y-%m')",
};

export interface SerieTemporal {
  periodo: Periodo;
  granularidad: Granularidad;
  puntos: Array<{ intervalo: string; cupones: number }>;
}

interface FilaSerie extends RowDataPacket {
  intervalo: string;
  cupones: number;
}

/**
 * Evolución del volumen de cupones a lo largo del tiempo.
 *
 * @param granularidad agrupación por día, semana o mes.
 * @param entradaPeriodo período relativo o rango explícito.
 * @param filtros recortes opcionales.
 */
export async function serieTemporal(
  granularidad: Granularidad = 'dia',
  entradaPeriodo: EntradaPeriodo = {},
  filtros: FiltrosCupones = {},
): Promise<SerieTemporal> {
  const formato = FORMATO_POR_GRANULARIDAD[granularidad];
  if (!formato) throw new Error(`Granularidad no soportada: ${granularidad}`);

  const periodo = resolverPeriodo(entradaPeriodo);
  const condiciones = construirCondiciones(periodo, filtros);

  const { filas } = await ejecutarSelect<FilaSerie>(
    `SELECT ${formato} AS intervalo, COUNT(*) AS cupones
       FROM ${tabla(TABLA_CUPONES)}
      WHERE ${condiciones.sql}
      GROUP BY intervalo
      ORDER BY intervalo`,
    condiciones.parametros,
    400,
  );

  return {
    periodo,
    granularidad,
    puntos: filas.map((fila) => ({ intervalo: fila.intervalo, cupones: Number(fila.cupones) })),
  };
}

export interface FichaCliente extends RowDataPacket {
  RutCliente: string | null;
  Nombres: string | null;
  Paterno: string | null;
  Materno: string | null;
  Email: string | null;
  Celular: string | null;
  Comuna: string | null;
  NombreRegion: string | null;
  atenciones: number;
  ultima_atencion: string | null;
  vehiculos: string | null;
}

/**
 * Busca clientes por RUT, nombre, correo o teléfono y resume su historial.
 * Es una búsqueda puntual: en modo `aggregate` devuelve los datos sin enmascarar.
 *
 * @param texto término libre con al menos 3 caracteres.
 * @param limite cantidad máxima de clientes a devolver.
 * @throws {Error} si el término es demasiado corto para acotar la búsqueda.
 */
export async function buscarCliente(texto: string, limite = 10) {
  const termino = (texto ?? '').trim();
  if (termino.length < 3) {
    throw new Error('El término de búsqueda debe tener al menos 3 caracteres');
  }
  const tope = Math.min(Math.max(Math.trunc(limite) || 10, 1), 50);
  const patron = `%${termino}%`;

  const { filas } = await ejecutarSelect<FichaCliente>(
    `SELECT RutCliente, Nombres, Paterno, Materno, Email, Celular, Comuna, NombreRegion,
            COUNT(*) AS atenciones,
            MAX(FechaCreacion) AS ultima_atencion,
            GROUP_CONCAT(DISTINCT CONCAT_WS(' ', NULLIF(Patente, ''), NULLIF(Modelo, '')) ORDER BY FechaCreacion DESC SEPARATOR ' | ') AS vehiculos
       FROM ${tabla(TABLA_CUPONES)}
      WHERE RutCliente LIKE ?
         OR CONCAT_WS(' ', Nombres, Paterno, Materno) LIKE ?
         OR RazonSocial LIKE ?
         OR Email LIKE ?
         OR Celular LIKE ?
      GROUP BY RutCliente, Nombres, Paterno, Materno, Email, Celular, Comuna, NombreRegion
      ORDER BY atenciones DESC
      LIMIT ${tope}`,
    [patron, patron, patron, patron, patron],
    tope,
  );

  return aplicarPolitica(filas, { busquedaPuntual: true });
}

export interface AtencionVehiculo extends RowDataPacket {
  id: number;
  FechaCreacion: string;
  NombreConcesionario: string | null;
  NombreLocal: string | null;
  Asesor: string | null;
  TipoDocumento: string | null;
  Descripcion: string | null;
  KM: number | null;
  OT: string | null;
  Patente: string | null;
  Vin: string | null;
  Modelo: string | null;
}

/**
 * Historial de atenciones de un vehículo, buscado por patente o VIN.
 * Es una búsqueda puntual.
 *
 * @param identificador patente o VIN, completo o parcial (mínimo 4 caracteres).
 * @param limite cantidad máxima de atenciones a devolver.
 * @throws {Error} si el identificador es demasiado corto.
 */
export async function historialVehiculo(identificador: string, limite = 20) {
  const termino = (identificador ?? '').trim();
  if (termino.length < 4) {
    throw new Error('Indicá al menos 4 caracteres de la patente o del VIN');
  }
  const tope = Math.min(Math.max(Math.trunc(limite) || 20, 1), 100);
  const patron = `%${termino}%`;

  const { filas } = await ejecutarSelect<AtencionVehiculo>(
    `SELECT id, FechaCreacion, NombreConcesionario, NombreLocal, Asesor, TipoDocumento,
            Descripcion, KM, OT, Patente, Vin, Modelo
       FROM ${tabla(TABLA_CUPONES)}
      WHERE Patente LIKE ? OR Vin LIKE ?
      ORDER BY FechaCreacion DESC
      LIMIT ${tope}`,
    [patron, patron],
    tope,
  );

  return aplicarPolitica(filas, { busquedaPuntual: true });
}

export interface ValorDimension {
  valor: string;
  cupones: number;
}

/**
 * Lista los valores reales de una dimensión, para que el modelo no invente
 * nombres de concesionarios, locales o familias que no existen.
 *
 * @param dimension eje a explorar.
 * @param limite cantidad de valores a devolver.
 */
export async function valoresDimension(dimension: Dimension, limite = 50): Promise<ValorDimension[]> {
  const expresion = EXPRESION_POR_DIMENSION[dimension];
  if (!expresion) throw new Error(`Dimensión no soportada: ${dimension}`);
  const tope = Math.min(Math.max(Math.trunc(limite) || 50, 1), 200);

  const { filas } = await ejecutarSelect<FilaConteo>(
    `SELECT ${expresion} AS etiqueta, COUNT(*) AS cupones
       FROM ${tabla(TABLA_CUPONES)}
      GROUP BY etiqueta
     HAVING etiqueta IS NOT NULL
      ORDER BY cupones DESC
      LIMIT ${tope}`,
    [],
    tope,
  );

  return filas.map((fila) => ({ valor: fila.etiqueta ?? 'sin dato', cupones: Number(fila.cupones) }));
}
