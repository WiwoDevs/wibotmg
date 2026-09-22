import { esModoDiagnostico, limpiarEventos, listarEventos } from '@/lib/diagnostico';
import { obtenerIdiomaActual } from '@/lib/idioma-servidor';
import { obtenerUsuarioActual } from '@/lib/sesion';
import { textosTablero } from '@/lib/textos/tablero';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Responde 404 cuando el modo diagnóstico está apagado, para no delatar la ruta. */
async function apagado(): Promise<Response> {
  const { errores } = textosTablero[await obtenerIdiomaActual()];
  return Response.json({ error: errores.noEncontrado }, { status: 404 });
}

/** Responde 401 con el aviso de sesión vencida en el idioma de quien pide. */
async function sesionExpirada(): Promise<Response> {
  const { errores } = textosTablero[await obtenerIdiomaActual()];
  return Response.json({ error: errores.sesionExpirada }, { status: 401 });
}

/**
 * Devuelve el registro técnico del servidor: rondas contra el modelo, consultas
 * a la base y errores crudos. Solo existe con WIBOT_DEV=1 y con sesión abierta.
 */
export async function GET(): Promise<Response> {
  if (!esModoDiagnostico()) return apagado();
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return sesionExpirada();

  return Response.json({ eventos: listarEventos() });
}

/** Vacía el registro técnico. */
export async function DELETE(): Promise<Response> {
  if (!esModoDiagnostico()) return apagado();
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return sesionExpirada();

  limpiarEventos();
  return Response.json({ ok: true });
}
