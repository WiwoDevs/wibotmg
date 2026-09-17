import { armarTablero } from '@/lib/tablero';
import { obtenerUsuarioActual } from '@/lib/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Entrega los datos del tablero para un período.
 * Exige sesión: son las mismas cifras que sirve el chat.
 */
export async function GET(peticion: Request): Promise<Response> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return Response.json({ error: 'Tu sesión expiró. Volvé a entrar.' }, { status: 401 });
  }

  const parametros = new URL(peticion.url).searchParams;
  const desde = parametros.get('desde') ?? '';
  const hasta = parametros.get('hasta') ?? '';

  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta)) {
    return Response.json({ error: 'Indicá "desde" y "hasta" con formato YYYY-MM-DD.' }, { status: 400 });
  }
  if (desde > hasta) {
    return Response.json({ error: 'El rango está invertido.' }, { status: 400 });
  }

  try {
    return Response.json(await armarTablero(desde, hasta));
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'No se pudo armar el tablero.';
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
