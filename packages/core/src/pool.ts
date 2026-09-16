import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { obtenerConfiguracion } from './config.js';

let poolCompartido: Pool | undefined;

/**
 * Devuelve el pool de conexiones MySQL/MariaDB, creándolo en la primera llamada.
 * Las conexiones se abren en modo solo lectura a nivel de sesión; el usuario de
 * base de datos debería además tener únicamente permiso SELECT.
 */
export function obtenerPool(): Pool {
  if (poolCompartido) return poolCompartido;
  const { db } = obtenerConfiguracion();

  poolCompartido = mysql.createPool({
    ...(db.socketPath ? { socketPath: db.socketPath } : { host: db.host, port: db.port }),
    user: db.user,
    password: db.password,
    database: db.database,
    connectionLimit: 5,
    waitForConnections: true,
    charset: 'utf8mb4_unicode_ci',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
  });

  return poolCompartido;
}

/** Cierra el pool. Usar al apagar el proceso o entre tests. */
export async function cerrarPool(): Promise<void> {
  if (!poolCompartido) return;
  await poolCompartido.end();
  poolCompartido = undefined;
}

export interface ResultadoConsulta<T = Record<string, unknown>> {
  filas: T[];
  columnas: string[];
  msTranscurridos: number;
  truncado: boolean;
}

/**
 * Ejecuta una sentencia SELECT ya validada y devuelve sus filas.
 * Fija la sesión en solo lectura y aplica el timeout configurado.
 *
 * @param sql sentencia SELECT/WITH única, sin punto y coma final.
 * @param parametros valores para los placeholders `?` de la sentencia.
 * @param limiteFilas corta el resultado en esta cantidad de filas.
 * @throws {Error} si la base rechaza la sentencia o se agota el timeout.
 */
export async function ejecutarSelect<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  parametros: ReadonlyArray<unknown> = [],
  limiteFilas?: number,
): Promise<ResultadoConsulta<T>> {
  const { timeoutConsultaMs, limiteFilas: limitePorDefecto } = obtenerConfiguracion();
  const tope = limiteFilas ?? limitePorDefecto;
  const pool = obtenerPool();
  const conexion = await pool.getConnection();
  const inicio = Date.now();

  try {
    await conexion.query('SET SESSION TRANSACTION READ ONLY');
    const [filas, campos] = await conexion.query<T[]>({
      sql,
      values: [...parametros],
      timeout: timeoutConsultaMs,
      rowsAsArray: false,
    });

    const listaFilas = Array.isArray(filas) ? filas : [];
    const truncado = listaFilas.length > tope;

    return {
      filas: (truncado ? listaFilas.slice(0, tope) : listaFilas) as T[],
      columnas: (campos ?? []).map((campo) => campo.name),
      msTranscurridos: Date.now() - inicio,
      truncado,
    };
  } finally {
    conexion.release();
  }
}
