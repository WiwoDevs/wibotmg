import 'server-only';
import { origenAutorizado, origenConocido, validarTokenServicio } from '@wibot/auth';
import { obtenerUsuarioActual } from '@/lib/sesion';

/**
 * Quien hace la petición, sea una persona con sesión abierta o una página
 * externa con token de servicio. Es lo que las rutas de API necesitan saber:
 * a quién auditar y qué cabeceras CORS devolver.
 */
export interface Actor {
  tipo: 'usuario' | 'token';
  /** Identificador del usuario, o null cuando entra un token de servicio. */
  usuarioId: number | null;
  /** Con esto queda registrado en la auditoría: el correo, o `token:<nombre>`. */
  etiqueta: string;
  /** Origen web desde el que llegó la petición, o null si no vino de un navegador. */
  origen: string | null;
}

export type ResultadoAcceso = { ok: true; actor: Actor } | { ok: false; respuesta: Response };

/** Métodos y cabeceras que se le permiten a una página externa. */
const METODOS_PERMITIDOS = 'GET, POST, OPTIONS';
const CABECERAS_PERMITIDAS = 'authorization, content-type';
const SEGUNDOS_PREFLIGHT = '600';

/**
 * Cabeceras CORS para una respuesta. Van vacías cuando la petición no trae
 * `Origin`: ahí no hay navegador que satisfacer y no hace falta abrir nada.
 *
 * @param origen origen ya autorizado, o null.
 */
export function cabecerasCors(origen: string | null): Record<string, string> {
  if (!origen) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Credentials': 'false',
    Vary: 'Origin',
  };
}

/** Responde con JSON agregando las cabeceras CORS que correspondan al origen. */
export function responderJson(cuerpo: unknown, estado: number, origen: string | null): Response {
  return Response.json(cuerpo, { status: estado, headers: cabecerasCors(origen) });
}

/**
 * Responde el preflight CORS. El navegador lo manda sin `Authorization`, así que
 * acá solo se puede comprobar que el origen pertenezca a algún token activo;
 * la validación del token ocurre en la petición real.
 *
 * @param peticion petición OPTIONS entrante.
 */
export function responderPreflight(peticion: Request): Response {
  const origen = peticion.headers.get('origin');
  if (!origenConocido(origen)) {
    return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...cabecerasCors(origen),
      'Access-Control-Allow-Methods': METODOS_PERMITIDOS,
      'Access-Control-Allow-Headers': CABECERAS_PERMITIDAS,
      'Access-Control-Max-Age': SEGUNDOS_PREFLIGHT,
    },
  });
}

/** Extrae el token de una cabecera `Authorization: Bearer <token>`. */
function leerBearer(peticion: Request): string | undefined {
  const cabecera = peticion.headers.get('authorization');
  if (!cabecera) return undefined;
  const [esquema, valor] = cabecera.split(' ');
  if (!esquema || esquema.toLowerCase() !== 'bearer') return undefined;
  return valor?.trim() || undefined;
}

/**
 * Resuelve quién está llamando: primero un token de servicio, si la petición
 * trae `Authorization`; si no, la cookie de sesión del navegador.
 *
 * Cuando el acceso no procede devuelve la respuesta de error ya armada, con sus
 * cabeceras CORS, para que la ruta la devuelva tal cual.
 *
 * @param peticion petición entrante.
 */
export async function autenticarPeticion(peticion: Request): Promise<ResultadoAcceso> {
  const origen = peticion.headers.get('origin');
  const bearer = leerBearer(peticion);

  if (bearer !== undefined) {
    const registro = validarTokenServicio(bearer);
    if (!registro) {
      return { ok: false, respuesta: responderJson({ error: 'Token de servicio inválido o revocado.' }, 401, null) };
    }
    if (!origenAutorizado(registro, origen)) {
      return {
        ok: false,
        respuesta: responderJson({ error: 'Este origen no está autorizado para el token.' }, 403, null),
      };
    }
    return {
      ok: true,
      actor: { tipo: 'token', usuarioId: null, etiqueta: `token:${registro.nombre}`, origen },
    };
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return { ok: false, respuesta: responderJson({ error: 'Tu sesión expiró. Volvé a entrar.' }, 401, null) };
  }
  // La sesión por cookie es de la propia aplicación: no se le abre CORS a nadie.
  return { ok: true, actor: { tipo: 'usuario', usuarioId: usuario.id, etiqueta: usuario.correo, origen: null } };
}
