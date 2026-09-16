import { obtenerConfiguracion } from './config.js';
import { obtenerTablasPermitidas } from './catalogo.js';
import { TABLAS_GESTION_PERMITIDAS } from './gestion-catalogo.js';

/** Error lanzado cuando una sentencia no supera la validación de solo lectura. */
export class SqlRechazadoError extends Error {
  constructor(motivo: string) {
    super(`Consulta rechazada: ${motivo}`);
    this.name = 'SqlRechazadoError';
  }
}

/** Palabras que jamás pueden aparecer en una consulta de WiBot. */
const PALABRAS_PROHIBIDAS = [
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'rename',
  'grant', 'revoke', 'commit', 'rollback', 'savepoint', 'lock',
  'unlock', 'call', 'execute', 'prepare', 'deallocate', 'handler', 'load',
  'outfile', 'dumpfile', 'infile', 'into', 'sleep', 'benchmark', 'set',
  'flush', 'shutdown', 'kill', 'reset', 'analyze', 'optimize', 'repair',
];

/** Esquemas del servidor que no aportan al negocio y quedan fuera de alcance. */
const ESQUEMAS_BLOQUEADOS = ['mysql', 'performance_schema', 'sys'];

/**
 * Quita comentarios y literales de texto para poder analizar la estructura
 * de la sentencia sin que el contenido de un string dispare falsos positivos.
 */
function limpiarParaAnalisis(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.|"")*"/g, '""')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrae los nombres declarados como CTE en una cláusula WITH. */
function extraerNombresCte(sqlLimpio: string): Set<string> {
  const nombres = new Set<string>();
  const patron = /(?:\bwith\b|,)\s*([`\w]+)\s+as\s*\(/gi;
  let coincidencia = patron.exec(sqlLimpio);
  while (coincidencia !== null) {
    const crudo = coincidencia[1];
    if (crudo) nombres.add(crudo.replace(/`/g, '').toLowerCase());
    coincidencia = patron.exec(sqlLimpio);
  }
  return nombres;
}

/** Extrae los nombres que aparecen tras FROM o JOIN. */
function extraerTablasReferenciadas(sqlLimpio: string): string[] {
  const nombres: string[] = [];
  const patron = /\b(?:from|join)\s+([`\w.]+)/gi;
  let coincidencia = patron.exec(sqlLimpio);
  while (coincidencia !== null) {
    const crudo = coincidencia[1];
    if (crudo) nombres.push(crudo.replace(/`/g, '').toLowerCase());
    coincidencia = patron.exec(sqlLimpio);
  }
  return nombres;
}

export interface SqlValidado {
  /** Sentencia lista para ejecutar, con LIMIT garantizado. */
  sql: string;
  /** true si WiBot tuvo que agregar el LIMIT porque la consulta no lo traía. */
  limiteAgregado: boolean;
  /** Tablas que la consulta lee. */
  tablas: string[];
}

/**
 * Valida que una sentencia sea una lectura segura y le garantiza un LIMIT.
 *
 * Rechaza: sentencias múltiples, cualquier verbo de escritura o administración,
 * lecturas contra esquemas del sistema y tablas que no existen en la base.
 *
 * @param sqlCrudo sentencia escrita por el modelo o por una persona.
 * @param limiteFilas tope de filas; por defecto el de la configuración.
 * @returns la sentencia normalizada y las tablas que toca.
 * @throws {SqlRechazadoError} si la sentencia no es una lectura segura.
 */
export async function validarSelect(
  sqlCrudo: string,
  limiteFilas?: number,
): Promise<SqlValidado> {
  return validarContra(sqlCrudo, await obtenerTablasPermitidas(), limiteFilas);
}

/**
 * Misma validación que `validarSelect`, contra las tablas de la base de gestión
 * (encuestas, leads, llamadas). Es sincrónica porque el catálogo es fijo.
 *
 * @param sqlCrudo sentencia escrita por el modelo o por una persona.
 * @param limiteFilas tope de filas opcional.
 * @throws {SqlRechazadoError} si la sentencia no es una lectura segura.
 */
export function validarSelectGestion(sqlCrudo: string, limiteFilas?: number): SqlValidado {
  return validarContraSincrono(sqlCrudo, TABLAS_GESTION_PERMITIDAS, limiteFilas);
}

async function validarContra(
  sqlCrudo: string,
  permitidas: ReadonlySet<string>,
  limiteFilas?: number,
): Promise<SqlValidado> {
  return validarContraSincrono(sqlCrudo, permitidas, limiteFilas);
}

function validarContraSincrono(
  sqlCrudo: string,
  permitidas: ReadonlySet<string>,
  limiteFilas?: number,
): SqlValidado {
  const { limiteFilas: limitePorDefecto } = obtenerConfiguracion();
  const tope = limiteFilas ?? limitePorDefecto;

  if (typeof sqlCrudo !== 'string' || sqlCrudo.trim() === '') {
    throw new SqlRechazadoError('la sentencia está vacía');
  }

  const sinPuntoYComa = sqlCrudo.trim().replace(/;\s*$/, '');
  const limpio = limpiarParaAnalisis(sinPuntoYComa);

  if (limpio === '') {
    throw new SqlRechazadoError('la sentencia solo contiene comentarios');
  }
  if (limpio.includes(';')) {
    throw new SqlRechazadoError('no se permite más de una sentencia por consulta');
  }
  if (!/^(select|with)\b/i.test(limpio)) {
    throw new SqlRechazadoError('solo se permiten sentencias SELECT o WITH');
  }

  for (const palabra of PALABRAS_PROHIBIDAS) {
    if (new RegExp(`\\b${palabra}\\b`, 'i').test(limpio)) {
      throw new SqlRechazadoError(`la palabra "${palabra.toUpperCase()}" no está permitida`);
    }
  }

  const referenciadas = extraerTablasReferenciadas(limpio);
  const nombresCte = extraerNombresCte(limpio);

  for (const referencia of referenciadas) {
    const [esquema, tablaConEsquema] = referencia.includes('.')
      ? referencia.split('.')
      : [undefined, referencia];

    if (esquema && ESQUEMAS_BLOQUEADOS.includes(esquema)) {
      throw new SqlRechazadoError(`el esquema "${esquema}" está fuera de alcance`);
    }

    const nombreTabla = tablaConEsquema ?? referencia;
    const esInformationSchema = esquema === 'information_schema';
    if (!esInformationSchema && !nombresCte.has(nombreTabla) && !permitidas.has(nombreTabla)) {
      throw new SqlRechazadoError(
        `la tabla "${nombreTabla}" no existe; pedí primero la lista de tablas`,
      );
    }
  }

  const yaTieneLimit = /\blimit\s+\d+/i.test(limpio);
  const sql = yaTieneLimit ? sinPuntoYComa : `${sinPuntoYComa}\nLIMIT ${tope}`;

  const tablas = referenciadas.filter((nombre) => !nombresCte.has(nombre));
  return { sql, limiteAgregado: !yaTieneLimit, tablas };
}
