import type { RowDataPacket } from 'mysql2/promise';
import { ejecutarSelect } from './pool.js';
import { validarSelect } from './guardia-sql.js';
import { aplicarPolitica } from './privacidad.js';

export interface ResultadoConsultaLibre {
  sqlEjecutado: string;
  filas: Array<Record<string, unknown>>;
  columnas: string[];
  cantidadFilas: number;
  truncado: boolean;
  limiteAgregado: boolean;
  columnasEnmascaradas: string[];
  msTranscurridos: number;
}

/**
 * Valida y ejecuta una consulta SELECT escrita por el modelo.
 * Es la vía de escape para preguntas que las consultas preparadas no cubren.
 *
 * @param sql sentencia SELECT o WITH, sin punto y coma final.
 * @param limiteFilas tope de filas opcional.
 * @returns filas ya pasadas por la política de privacidad.
 * @throws {SqlRechazadoError} si la sentencia no es una lectura segura.
 */
export async function consultaLibre(
  sql: string,
  limiteFilas?: number,
): Promise<ResultadoConsultaLibre> {
  const validado = await validarSelect(sql, limiteFilas);
  const resultado = await ejecutarSelect<RowDataPacket>(validado.sql, [], limiteFilas);
  const politica = aplicarPolitica(resultado.filas as Array<Record<string, unknown>>);

  return {
    sqlEjecutado: validado.sql,
    filas: politica.filas,
    columnas: resultado.columnas,
    cantidadFilas: politica.filas.length,
    truncado: resultado.truncado,
    limiteAgregado: validado.limiteAgregado,
    columnasEnmascaradas: politica.columnasEnmascaradas,
    msTranscurridos: resultado.msTranscurridos,
  };
}
