import { cookies } from 'next/headers';
import {
  NOMBRE_COOKIE,
  cerrarSesion,
  crearSesion,
  esUsuarioValido,
  registrarIntento,
  revisarBloqueo,
  verificarCredenciales,
} from '@wibot/auth';
import { idiomaDePeticion } from '@/lib/idioma-servidor';
import { obtenerIp, opcionesCookie } from '@/lib/sesion';
import { textosServidor } from '@/lib/textos/servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CuerpoEntrada {
  correo?: unknown;
  contrasena?: unknown;
}

/**
 * Inicia sesión. Responde siempre el mismo mensaje ante credenciales incorrectas,
 * exista o no la cuenta, para no revelar qué correos están registrados.
 */
export async function POST(peticion: Request): Promise<Response> {
  const textos = textosServidor[idiomaDePeticion(peticion)].sesion;
  let cuerpo: CuerpoEntrada;
  try {
    cuerpo = (await peticion.json()) as CuerpoEntrada;
  } catch {
    return Response.json({ error: textos.peticionMalFormada }, { status: 400 });
  }

  const correo = typeof cuerpo.correo === 'string' ? cuerpo.correo.trim() : '';
  const contrasena = typeof cuerpo.contrasena === 'string' ? cuerpo.contrasena : '';
  const ip = await obtenerIp(peticion);

  if (correo === '' || contrasena === '' || !esUsuarioValido(correo)) {
    return Response.json({ error: textos.faltanDatos }, { status: 400 });
  }

  const bloqueo = revisarBloqueo(correo, ip);
  if (bloqueo.bloqueado) {
    return Response.json({ error: textos.demasiadosIntentos(bloqueo.minutosRestantes) }, { status: 429 });
  }

  const usuario = await verificarCredenciales(correo, contrasena);
  if (!usuario) {
    registrarIntento(correo, ip, false);
    return Response.json({ error: textos.credencialesIncorrectas }, { status: 401 });
  }

  registrarIntento(correo, ip, true);
  const sesion = crearSesion(usuario.id, ip, peticion.headers.get('user-agent') ?? undefined);

  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, sesion.token, opcionesCookie(sesion.expiraEn));

  return Response.json({
    usuario: { correo: usuario.correo, nombre: usuario.nombre, debeCambiar: usuario.debeCambiar },
  });
}

/** Cierra la sesión en curso y borra la cookie. */
export async function DELETE(): Promise<Response> {
  const almacen = await cookies();
  cerrarSesion(almacen.get(NOMBRE_COOKIE)?.value);
  almacen.set(NOMBRE_COOKIE, '', opcionesCookie());
  return Response.json({ ok: true });
}
