import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ahora, obtenerBaseAcceso } from './base.js';

/** Prefijo con el que arranca todo token de servicio, para reconocerlo de un vistazo. */
export const PREFIJO_TOKEN = 'wibot_';

export interface TokenServicio {
  id: number;
  nombre: string;
  /** Orígenes web autorizados a usar el token desde un navegador. Vacío: solo servidor a servidor. */
  origenes: string[];
  activo: boolean;
  creadoEn: string;
  ultimoUso: string | null;
}

interface FilaToken {
  id: number;
  nombre: string;
  origenes: string;
  activo: number;
  creado_en: string;
  ultimo_uso: string | null;
}

/** Guarda el hash del token, nunca el token en sí. */
function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function aToken(fila: FilaToken): TokenServicio {
  let origenes: string[] = [];
  try {
    const valor: unknown = JSON.parse(fila.origenes);
    if (Array.isArray(valor)) origenes = valor.map(String);
  } catch {
    origenes = [];
  }
  return {
    id: fila.id,
    nombre: fila.nombre,
    origenes,
    activo: fila.activo === 1,
    creadoEn: fila.creado_en,
    ultimoUso: fila.ultimo_uso,
  };
}

/** Normaliza un nombre de token: sin espacios alrededor y en minúsculas. */
export function normalizarNombreToken(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Normaliza un origen web al formato con el que lo manda el navegador
 * en la cabecera `Origin`: esquema, host y puerto, sin barra final ni ruta.
 *
 * @param origen origen tal como lo escribió quien creó el token.
 * @returns el origen normalizado, o undefined si no es una URL http/https válida.
 */
export function normalizarOrigen(origen: string): string | undefined {
  const texto = origen.trim();
  if (texto === '') return undefined;
  try {
    const url = new URL(texto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Da de alta un token de servicio y devuelve el token en claro, que es la
 * única vez que existe: en la base solo queda su SHA-256.
 *
 * @param nombre identificador de quién va a usarlo, único entre los tokens.
 * @param origenes orígenes web autorizados; vacío deja el token solo para llamadas de servidor.
 * @throws si el nombre está vacío, ya existe, o algún origen no es una URL http/https.
 */
export function crearTokenServicio(nombre: string, origenes: string[] = []): { token: string; registro: TokenServicio } {
  const limpio = normalizarNombreToken(nombre);
  if (limpio === '') throw new Error('El token necesita un nombre.');
  if (limpio.length > 60) throw new Error('El nombre del token no puede pasar de 60 caracteres.');

  const normalizados: string[] = [];
  for (const origen of origenes) {
    const valido = normalizarOrigen(origen);
    if (!valido) throw new Error(`Origen inválido: "${origen}". Se espera algo como https://sitio.cl`);
    if (!normalizados.includes(valido)) normalizados.push(valido);
  }

  const base = obtenerBaseAcceso();
  const existente = base.prepare('SELECT id FROM tokens_servicio WHERE nombre = ?').get(limpio);
  if (existente) throw new Error(`Ya existe un token llamado "${limpio}". Revocalo antes de recrearlo.`);

  const token = `${PREFIJO_TOKEN}${randomBytes(32).toString('base64url')}`;
  base
    .prepare(
      `INSERT INTO tokens_servicio (nombre, token_hash, origenes, activo, creado_en, ultimo_uso)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    )
    .run(limpio, hashearToken(token), JSON.stringify(normalizados), ahora());

  const registro = buscarTokenPorNombre(limpio);
  if (!registro) throw new Error('No se pudo leer el token recién creado.');
  return { token, registro };
}

/** Devuelve un token por su nombre, activo o no. */
export function buscarTokenPorNombre(nombre: string): TokenServicio | undefined {
  const fila = obtenerBaseAcceso()
    .prepare(
      `SELECT id, nombre, origenes, activo, creado_en, ultimo_uso
         FROM tokens_servicio WHERE nombre = ?`,
    )
    .get(normalizarNombreToken(nombre)) as unknown as FilaToken | undefined;
  return fila ? aToken(fila) : undefined;
}

/**
 * Valida un token recibido en la cabecera `Authorization` y deja registrado su uso.
 * Un token revocado no valida.
 *
 * @param token token en claro; puede ser undefined si la petición no traía ninguno.
 * @returns el token de servicio, o undefined si no existe o está revocado.
 */
export function validarTokenServicio(token: string | undefined): TokenServicio | undefined {
  if (!token || token.trim() === '') return undefined;

  const base = obtenerBaseAcceso();
  const hash = hashearToken(token.trim());
  const fila = base
    .prepare(
      `SELECT id, nombre, origenes, activo, creado_en, ultimo_uso
         FROM tokens_servicio WHERE token_hash = ?`,
    )
    .get(hash) as unknown as FilaToken | undefined;

  if (!fila || fila.activo !== 1) return undefined;

  base.prepare('UPDATE tokens_servicio SET ultimo_uso = ? WHERE id = ?').run(ahora(), fila.id);
  return aToken({ ...fila, ultimo_uso: ahora() });
}

/**
 * Indica si un origen web está autorizado para un token.
 * La comparación es de tiempo constante para no filtrar orígenes por temporización.
 *
 * @param registro token de servicio ya validado.
 * @param origen valor de la cabecera `Origin`; null cuando la llamada no viene de un navegador.
 */
export function origenAutorizado(registro: TokenServicio, origen: string | null): boolean {
  // Sin cabecera Origin no hay navegador de por medio: el token es toda la credencial.
  if (origen === null) return true;
  const normalizado = normalizarOrigen(origen);
  if (!normalizado) return false;
  const esperado = Buffer.from(normalizado);
  return registro.origenes.some((permitido) => {
    const candidato = Buffer.from(permitido);
    return candidato.length === esperado.length && timingSafeEqual(candidato, esperado);
  });
}

/**
 * Indica si algún token activo autoriza este origen. Sirve para responder el
 * preflight CORS, que el navegador manda sin cabecera `Authorization`.
 *
 * @param origen valor de la cabecera `Origin` de la petición OPTIONS.
 */
export function origenConocido(origen: string | null): boolean {
  if (origen === null) return false;
  const normalizado = normalizarOrigen(origen);
  if (!normalizado) return false;
  return listarTokensServicio()
    .filter((registro) => registro.activo)
    .some((registro) => registro.origenes.includes(normalizado));
}

/** Lista los tokens, del más nuevo al más viejo. Nunca devuelve el token en claro. */
export function listarTokensServicio(): TokenServicio[] {
  const filas = obtenerBaseAcceso()
    .prepare(
      `SELECT id, nombre, origenes, activo, creado_en, ultimo_uso
         FROM tokens_servicio ORDER BY creado_en DESC`,
    )
    .all() as unknown as FilaToken[];
  return filas.map(aToken);
}

/**
 * Revoca un token: queda inactivo y deja de validar, pero sobrevive en la base
 * para que la auditoría anterior siga teniendo a quién apuntar.
 *
 * @param nombre nombre del token a revocar.
 * @throws si no existe ningún token con ese nombre.
 */
export function revocarTokenServicio(nombre: string): TokenServicio {
  const limpio = normalizarNombreToken(nombre);
  const registro = buscarTokenPorNombre(limpio);
  if (!registro) throw new Error(`No existe ningún token llamado "${limpio}".`);
  obtenerBaseAcceso().prepare('UPDATE tokens_servicio SET activo = 0 WHERE id = ?').run(registro.id);
  return { ...registro, activo: false };
}
