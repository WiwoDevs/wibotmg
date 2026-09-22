import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_IDIOMA, normalizarIdioma, type Idioma } from './idioma';

/** Idioma elegido por quien hace la petición, leído de su cookie. */
export async function obtenerIdiomaActual(): Promise<Idioma> {
  const almacen = await cookies();
  return normalizarIdioma(almacen.get(COOKIE_IDIOMA)?.value);
}

/**
 * Idioma de una petición a la API: primero el que manda el cuerpo, después la cookie.
 *
 * @param peticion petición entrante.
 * @param delCuerpo idioma que vino en el cuerpo JSON, si vino.
 */
export function idiomaDePeticion(peticion: Request, delCuerpo?: unknown): Idioma {
  if (typeof delCuerpo === 'string') return normalizarIdioma(delCuerpo);
  const cookie = peticion.headers
    .get('cookie')
    ?.split(';')
    .map((parte) => parte.trim())
    .find((parte) => parte.startsWith(`${COOKIE_IDIOMA}=`));
  return normalizarIdioma(cookie?.slice(COOKIE_IDIOMA.length + 1));
}
