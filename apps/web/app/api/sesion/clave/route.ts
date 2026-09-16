import { cambiarContrasena, obtenerConfiguracionAcceso, verificarCredenciales } from '@wibot/auth';
import { obtenerUsuarioActual } from '@/lib/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CuerpoClave {
  actual?: unknown;
  nueva?: unknown;
}

/**
 * Cambia la contraseña del usuario en sesión.
 * Exige la contraseña actual, para que una sesión robada no baste para
 * apropiarse de la cuenta.
 */
export async function POST(peticion: Request): Promise<Response> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return Response.json({ error: 'Tu sesión expiró. Volvé a entrar.' }, { status: 401 });
  }

  let cuerpo: CuerpoClave;
  try {
    cuerpo = (await peticion.json()) as CuerpoClave;
  } catch {
    return Response.json({ error: 'Petición mal formada.' }, { status: 400 });
  }

  const actual = typeof cuerpo.actual === 'string' ? cuerpo.actual : '';
  const nueva = typeof cuerpo.nueva === 'string' ? cuerpo.nueva : '';
  const { largoMinimoContrasena } = obtenerConfiguracionAcceso();

  if (nueva.length < largoMinimoContrasena) {
    return Response.json(
      { error: `La contraseña nueva debe tener al menos ${largoMinimoContrasena} caracteres.` },
      { status: 400 },
    );
  }
  if (nueva === actual) {
    return Response.json({ error: 'La contraseña nueva tiene que ser distinta de la actual.' }, { status: 400 });
  }

  const valida = await verificarCredenciales(usuario.correo, actual);
  if (!valida) {
    return Response.json({ error: 'La contraseña actual no coincide.' }, { status: 401 });
  }

  await cambiarContrasena(usuario.correo, nueva);
  return Response.json({ ok: true });
}
