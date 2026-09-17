import { armarTablero } from '@/lib/tablero';
import { autenticarPeticion, responderJson, responderPreflight } from '@/lib/acceso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Deja que una página externa autorizada pida el tablero desde el navegador. */
export function OPTIONS(peticion: Request): Response {
  return responderPreflight(peticion);
}

/**
 * Entrega los datos del tablero para un período.
 * Exige sesión o token de servicio: son las mismas cifras que sirve el chat.
 */
export async function GET(peticion: Request): Promise<Response> {
  const acceso = await autenticarPeticion(peticion);
  if (!acceso.ok) return acceso.respuesta;
  const { origen } = acceso.actor;

  const parametros = new URL(peticion.url).searchParams;
  const desde = parametros.get('desde') ?? '';
  const hasta = parametros.get('hasta') ?? '';

  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta)) {
    return responderJson({ error: 'Indicá "desde" y "hasta" con formato YYYY-MM-DD.' }, 400, origen);
  }
  if (desde > hasta) {
    return responderJson({ error: 'El rango está invertido.' }, 400, origen);
  }

  try {
    return responderJson(await armarTablero(desde, hasta), 200, origen);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'No se pudo armar el tablero.';
    return responderJson({ error: mensaje }, 500, origen);
  }
}
