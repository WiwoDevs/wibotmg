import { obtenerConfiguracion } from './config.js';
import { COLUMNAS_PERSONALES } from './catalogo.js';

/**
 * Enmascara un RUT chileno dejando visibles los dos primeros dígitos.
 * @example maskRut('12345678-9') // '12•••••••'
 */
export function enmascararRut(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length <= 2) return '•'.repeat(limpio.length);
  return `${limpio.slice(0, 2)}${'•'.repeat(Math.max(limpio.length - 2, 3))}`;
}

/** Enmascara un teléfono dejando visibles los últimos tres dígitos. */
export function enmascararTelefono(valor: string): string {
  const limpio = valor.trim();
  if (limpio.length <= 3) return '•'.repeat(limpio.length);
  return `${'•'.repeat(limpio.length - 3)}${limpio.slice(-3)}`;
}

/** Enmascara un correo dejando visibles la inicial y el dominio. */
export function enmascararEmail(valor: string): string {
  const limpio = valor.trim();
  const arroba = limpio.indexOf('@');
  if (arroba <= 0) return '•'.repeat(limpio.length);
  return `${limpio[0]}•••${limpio.slice(arroba)}`;
}

/** Enmascara un nombre dejando visible solo la inicial de cada palabra. */
export function enmascararNombre(valor: string): string {
  return valor
    .trim()
    .split(/\s+/)
    .map((parte) => (parte.length > 1 ? `${parte[0]}.` : parte))
    .join(' ');
}

function enmascararValor(columna: string, valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  const texto = String(valor);
  if (texto === '') return texto;

  const nombre = columna.toLowerCase();
  if (nombre.includes('rut')) return enmascararRut(texto);
  if (nombre.includes('mail')) return enmascararEmail(texto);
  if (nombre.includes('telefono') || nombre.includes('celular')) return enmascararTelefono(texto);
  if (nombre.includes('direccion')) return '•••';
  if (nombre.includes('fechanacimiento')) return '•••';
  return enmascararNombre(texto);
}

export interface OpcionesPolitica {
  /**
   * true cuando la consulta es una búsqueda puntual y explícita de una persona
   * o vehículo. En modo `aggregate` es lo único que destapa los datos personales.
   */
  busquedaPuntual?: boolean;
}

export interface ResultadoPolitica<T> {
  filas: T[];
  /** Columnas personales que fueron enmascaradas en este resultado. */
  columnasEnmascaradas: string[];
}

/**
 * Aplica la política de privacidad configurada sobre un conjunto de filas.
 *
 * - `full`: devuelve todo tal cual.
 * - `masked`: enmascara siempre las columnas personales.
 * - `aggregate`: enmascara salvo que sea una búsqueda puntual.
 *
 * @param filas filas crudas devueltas por la base.
 * @param opciones marca si el llamado es una búsqueda puntual.
 */
export function aplicarPolitica<T extends Record<string, unknown>>(
  filas: T[],
  opciones: OpcionesPolitica = {},
): ResultadoPolitica<T> {
  const { modoPrivacidad } = obtenerConfiguracion();

  const debeEnmascarar =
    modoPrivacidad === 'masked' ||
    (modoPrivacidad === 'aggregate' && opciones.busquedaPuntual !== true);

  if (!debeEnmascarar || filas.length === 0) {
    return { filas, columnasEnmascaradas: [] };
  }

  const primera = filas[0];
  if (!primera) return { filas, columnasEnmascaradas: [] };

  const columnasPersonales = Object.keys(primera).filter((columna) =>
    COLUMNAS_PERSONALES.has(columna.toLowerCase()),
  );

  if (columnasPersonales.length === 0) {
    return { filas, columnasEnmascaradas: [] };
  }

  const enmascaradas = filas.map((fila) => {
    const copia: Record<string, unknown> = { ...fila };
    for (const columna of columnasPersonales) {
      copia[columna] = enmascararValor(columna, fila[columna]);
    }
    return copia as T;
  });

  return { filas: enmascaradas, columnasEnmascaradas: columnasPersonales };
}
