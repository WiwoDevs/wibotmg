import 'server-only';
import { cookies, headers } from 'next/headers';
import { NOMBRE_COOKIE, validarSesion, type Usuario } from '@wibot/auth';

/**
 * Devuelve el usuario de la sesión en curso, o undefined si no hay ninguna válida.
 * Es la única fuente de verdad sobre quién está entrando: el middleware solo
 * mira si existe la cookie, la comprobación real ocurre acá.
 */
export async function obtenerUsuarioActual(): Promise<Usuario | undefined> {
  const almacen = await cookies();
  return validarSesion(almacen.get(NOMBRE_COOKIE)?.value);
}

/**
 * Deduce la dirección desde la que llega la petición, mirando primero las
 * cabeceras que pone un proxy inverso.
 *
 * @param peticion petición entrante; si se omite, se leen las cabeceras del contexto.
 */
export async function obtenerIp(peticion?: Request): Promise<string> {
  const cabeceras = peticion ? peticion.headers : await headers();
  const reenviado = cabeceras.get('x-forwarded-for');
  if (reenviado) {
    const primera = reenviado.split(',')[0]?.trim();
    if (primera) return primera;
  }
  return cabeceras.get('x-real-ip')?.trim() || 'desconocida';
}

/** Opciones con las que se escribe y se borra la cookie de sesión. */
export function opcionesCookie(expiraEn?: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.WIBOT_COOKIE_SEGURA === '1',
    path: '/',
    ...(expiraEn ? { expires: expiraEn } : { maxAge: 0 }),
  };
}
