import { IDIOMA_PREDETERMINADO, LOCALE_IDIOMA } from './idioma';

/** Locale que se usa cuando quien llama no indica ninguno. */
const LOCALE_POR_DEFECTO = LOCALE_IDIOMA[IDIOMA_PREDETERMINADO];

/** Marca que se muestra cuando no hay un valor que formatear. */
const SIN_VALOR = '—';

/** Fecha ISO (YYYY-MM-DD) al comienzo de un texto. */
const PATRON_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Convierte un valor cualquiera en número finito.
 * @returns el número, o null si el valor no es numérico.
 */
function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Convierte una fecha ISO (YYYY-MM-DD) en un Date a medianoche UTC.
 * @returns la fecha, o null si el texto no empieza con una fecha ISO.
 */
function aFechaUtc(valor: unknown): Date | null {
  const coincidencia = PATRON_FECHA_ISO.exec(String(valor ?? ''));
  if (!coincidencia) return null;
  const [, anio, mes, dia] = coincidencia;
  return new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
}

/**
 * Formatea un número con el separador de miles del idioma.
 * @param valor número o cadena numérica; cualquier otra cosa devuelve un guion.
 * @param locale locale BCP 47; por defecto el del idioma predeterminado.
 */
export function formatearNumero(valor: unknown, locale: string = LOCALE_POR_DEFECTO): string {
  const numero = aNumero(valor);
  if (numero === null) return SIN_VALOR;
  return new Intl.NumberFormat(locale).format(numero);
}

/**
 * Formatea un número con una cantidad fija de decimales.
 * @param valor número o cadena numérica; cualquier otra cosa devuelve un guion.
 * @param decimales cantidad de decimales a mostrar.
 * @param locale locale BCP 47; por defecto el del idioma predeterminado.
 */
export function formatearDecimal(valor: unknown, decimales: number, locale: string = LOCALE_POR_DEFECTO): string {
  const numero = aNumero(valor);
  if (numero === null) return SIN_VALOR;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(numero);
}

/**
 * Formatea un porcentaje con un decimal.
 * @param valor porcentaje ya calculado sobre 100.
 * @param locale locale BCP 47; por defecto el del idioma predeterminado.
 */
export function formatearPorcentaje(valor: unknown, locale: string = LOCALE_POR_DEFECTO): string {
  const numero = aNumero(valor);
  if (numero === null) return SIN_VALOR;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(numero / 100);
}

/**
 * Convierte una fecha ISO (YYYY-MM-DD) al formato corto del idioma.
 * Si el valor no es una fecha reconocible lo devuelve tal cual.
 *
 * @param valor fecha ISO, con o sin hora.
 * @param locale locale BCP 47; por defecto el del idioma predeterminado.
 */
export function formatearFecha(valor: unknown, locale: string = LOCALE_POR_DEFECTO): string {
  const fecha = aFechaUtc(valor);
  if (!fecha) return String(valor ?? '') || SIN_VALOR;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(fecha);
}

/**
 * Convierte una fecha ISO en día y mes abreviado, por ejemplo "Aug 19".
 * Si el valor no es una fecha reconocible lo devuelve tal cual.
 *
 * @param valor fecha ISO YYYY-MM-DD.
 * @param locale locale BCP 47; por defecto el del idioma predeterminado.
 */
export function formatearDiaCorto(valor: unknown, locale: string = LOCALE_POR_DEFECTO): string {
  const fecha = aFechaUtc(valor);
  if (!fecha) return String(valor ?? '');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(fecha);
}

/**
 * Formatea un rango de fechas ISO como texto legible del idioma.
 *
 * @param desde fecha inicial YYYY-MM-DD.
 * @param hasta fecha final YYYY-MM-DD.
 * @param locale locale BCP 47; por defecto el del idioma predeterminado.
 * @returns el rango, o null si alguna de las dos no es una fecha reconocible.
 */
export function formatearRangoFechas(
  desde: unknown,
  hasta: unknown,
  locale: string = LOCALE_POR_DEFECTO,
): string | null {
  const inicio = aFechaUtc(desde);
  const fin = aFechaUtc(hasta);
  if (!inicio || !fin) return null;
  const formato = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return inicio.getTime() === fin.getTime() ? formato.format(inicio) : formato.formatRange(inicio, fin);
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
 * Es el respaldo para columnas que no tienen traducción conocida.
 * @example etiquetarColumna('NombreConcesionario') // 'Nombre concesionario'
 */
export function etiquetarColumna(nombre: string): string {
  const conEspacios = nombre
    .replace(/_/g, ' ')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .trim();
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1).toLowerCase();
}
