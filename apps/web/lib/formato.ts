/**
 * Formatea un entero con separador de miles chileno.
 * @param valor número o cadena numérica; cualquier otra cosa devuelve un guion.
 */
export function formatearNumero(valor: unknown): string {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return new Intl.NumberFormat('es-CL').format(numero);
}

/**
 * Formatea un porcentaje con un decimal.
 * @param valor porcentaje ya calculado sobre 100.
 */
export function formatearPorcentaje(valor: unknown): string {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return '—';
  return `${numero.toFixed(1).replace('.', ',')}%`;
}

/**
 * Convierte una fecha ISO (YYYY-MM-DD) al formato corto chileno.
 * Si el valor no es una fecha reconocible lo devuelve tal cual.
 */
export function formatearFecha(valor: unknown): string {
  const texto = String(valor ?? '');
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!coincidencia) return texto || '—';
  const [, anio, mes, dia] = coincidencia;
  return `${dia}-${mes}-${anio}`;
}

/** Columnas cuyo contenido se lee como identificador o medida y va en monoespaciada. */
const COLUMNAS_TECNICAS = ['rut', 'vin', 'patente', 'ot', 'km', 'id', 'telefono', 'celular', 'email'];

/** Indica si una columna debe renderizarse con la familia monoespaciada. */
export function esColumnaTecnica(nombre: string): boolean {
  const minuscula = nombre.toLowerCase();
  return COLUMNAS_TECNICAS.some((tecnica) => minuscula.includes(tecnica));
}

/** Indica si el valor de una celda es numérico y por tanto se alinea a la derecha. */
export function esValorNumerico(valor: unknown): boolean {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * Convierte el nombre de una columna de la base en una etiqueta legible.
 * @example etiquetarColumna('NombreConcesionario') // 'Nombre concesionario'
 */
export function etiquetarColumna(nombre: string): string {
  const conEspacios = nombre
    .replace(/_/g, ' ')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .trim();
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1).toLowerCase();
}
