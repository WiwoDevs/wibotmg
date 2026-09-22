/** Idiomas en los que se puede usar la app y en los que responde el modelo. */
export const IDIOMAS = ['es', 'en', 'zh'] as const;

export type Idioma = (typeof IDIOMAS)[number];

/** Idioma con el que arranca quien todavía no eligió ninguno. */
export const IDIOMA_PREDETERMINADO: Idioma = 'es';

/** Cookie donde queda guardado el idioma elegido; la lee el servidor y el navegador. */
export const COOKIE_IDIOMA = 'wibot_idioma';

/** Etiqueta con la que cada idioma aparece en el selector. */
export const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'ES', en: 'EN', zh: '中文' };

/** Código BCP 47 para el atributo lang del documento y para Intl. */
export const LOCALE_IDIOMA: Record<Idioma, string> = { es: 'es-CL', en: 'en-US', zh: 'zh-CN' };

/**
 * Convierte cualquier valor recibido (cookie, cuerpo de una petición) en un idioma soportado.
 *
 * @param valor valor sin validar.
 * @returns el idioma si es válido, o el predeterminado en cualquier otro caso.
 */
export function normalizarIdioma(valor: unknown): Idioma {
  return typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor)
    ? (valor as Idioma)
    : IDIOMA_PREDETERMINADO;
}
