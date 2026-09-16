import { consultarGestion } from './gestion-base.js';
import { validarSelectGestion } from './guardia-sql.js';
import { aplicarPolitica } from './privacidad.js';
import { obtenerConfiguracion } from './config.js';

export interface ResultadoConsultaGestion {
  sqlEjecutado: string;
  filas: Array<Record<string, unknown>>;
  columnas: string[];
  cantidadFilas: number;
  limiteAgregado: boolean;
  columnasEnmascaradas: string[];
  msTranscurridos: number;
}

/**
 * Valida y ejecuta un SELECT sobre la base de gestión (encuestas, leads,
 * llamadas y anexos). Misma guardia de solo lectura que la base de cupones.
 *
 * @param sql sentencia SELECT o WITH, sin punto y coma final.
 * @param limiteFilas tope de filas opcional.
 * @throws {SqlRechazadoError} si la sentencia no es una lectura segura.
 */
export function consultaLibreGestion(sql: string, limiteFilas?: number): ResultadoConsultaGestion {
  const { limiteFilas: limitePorDefecto } = obtenerConfiguracion();
  const tope = limiteFilas ?? limitePorDefecto;
  const validado = validarSelectGestion(sql, limiteFilas);

  const inicio = Date.now();
  const crudas = consultarGestion<Record<string, unknown>>(validado.sql);
  const msTranscurridos = Date.now() - inicio;

  const recortadas = crudas.slice(0, tope);
  const politica = aplicarPolitica(recortadas);
  const primera = politica.filas[0];

  return {
    sqlEjecutado: validado.sql,
    filas: politica.filas,
    columnas: primera ? Object.keys(primera) : [],
    cantidadFilas: politica.filas.length,
    limiteAgregado: validado.limiteAgregado,
    columnasEnmascaradas: politica.columnasEnmascaradas,
    msTranscurridos,
  };
}
