import { esModoDiagnostico, limpiarEventos, listarEventos } from '@/lib/diagnostico';
import { obtenerUsuarioActual } from '@/lib/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Responde 404 cuando el modo diagnóstico está apagado, para no delatar la ruta. */
function apagado(): Response {
  return Response.json({ error: 'No encontrado.' }, { status: 404 });
}

/**
 * Devuelve el registro técnico del servidor: rondas contra el modelo, consultas
 * a la base y errores crudos. Solo existe con WIBOT_DEV=1 y con sesión abierta.
 */
export async function GET(): Promise<Response> {
  if (!esModoDiagnostico()) return apagado();
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return Response.json({ error: 'Tu sesión expiró.' }, { status: 401 });

  return Response.json({ eventos: listarEventos() });
}

/** Vacía el registro técnico. */
export async function DELETE(): Promise<Response> {
  if (!esModoDiagnostico()) return apagado();
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return Response.json({ error: 'Tu sesión expiró.' }, { status: 401 });

  limpiarEventos();
  return Response.json({ ok: true });
}
