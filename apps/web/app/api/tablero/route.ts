import { armarTablero } from '@/lib/tablero';
import { autenticarPeticion, responderJson, responderPreflight } from '@/lib/acceso';
import { idiomaDePeticion } from '@/lib/idioma-servidor';
import { textosTablero } from '@/lib/textos/tablero';

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
 * Los textos salen en el idioma de la cookie de quien pide.
 */
export async function GET(peticion: Request): Promise<Response> {
  const acceso = await autenticarPeticion(peticion);
  if (!acceso.ok) return acceso.respuesta;
  const { origen } = acceso.actor;

  const parametros = new URL(peticion.url).searchParams;
  const desde = parametros.get('desde') ?? '';
  const hasta = parametros.get('hasta') ?? '';
  const idioma = idiomaDePeticion(peticion);
  const errores = textosTablero[idioma].errores;

  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta)) {
    return responderJson({ error: errores.fechasInvalidas }, 400, origen);
  }
  if (desde > hasta) {
    return responderJson({ error: errores.rangoInvertido }, 400, origen);
  }

  try {
    return responderJson(await armarTablero(desde, hasta, idioma), 200, origen);
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : errores.noSePudoArmar;
    return responderJson({ error: mensaje }, 500, origen);
  }
}
