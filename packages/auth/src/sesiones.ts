import { createHash, randomBytes } from 'node:crypto';
import { ahora, obtenerBaseAcceso } from './base.js';
import { obtenerConfiguracionAcceso } from './config.js';
import { buscarPorId, registrarAcceso, type Usuario } from './usuarios.js';

/** Nombre de la cookie donde viaja el token de sesión. */
export const NOMBRE_COOKIE = 'wibot_sesion';

/** Guarda el hash del token, nunca el token en sí. */
function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SesionCreada {
  /** Token en claro, el único momento en que existe. Va a la cookie. */
  token: string;
  expiraEn: Date;
}

/**
 * Abre una sesión para un usuario y devuelve el token que debe guardar el navegador.
 * En la base solo queda el hash del token, así que un volcado del SQLite no
 * permite suplantar a nadie.
 *
 * @param usuarioId identificador del usuario que inició sesión.
 * @param ip dirección desde la que se conectó, para auditoría.
 * @param agente user agent del navegador, para auditoría.
 */
export function crearSesion(usuarioId: number, ip?: string, agente?: string): SesionCreada {
  const { horasSesion } = obtenerConfiguracionAcceso();
  const token = randomBytes(32).toString('base64url');
  const expiraEn = new Date(Date.now() + horasSesion * 60 * 60 * 1000);

  obtenerBaseAcceso()
    .prepare(
      `INSERT INTO sesiones (usuario_id, token_hash, creada_en, expira_en, ip, agente)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(usuarioId, hashearToken(token), ahora(), expiraEn.toISOString(), ip ?? null, agente ?? null);

  registrarAcceso(usuarioId);
  purgarSesionesVencidas();

  return { token, expiraEn };
}

/**
 * Valida un token de sesión y devuelve el usuario dueño de la sesión.
 * Una sesión vencida se borra en el acto y devuelve undefined.
 *
 * @param token token recibido en la cookie; puede ser undefined.
 */
export function validarSesion(token: string | undefined): Usuario | undefined {
  if (!token || token.trim() === '') return undefined;

  const base = obtenerBaseAcceso();
  const fila = base
    .prepare('SELECT usuario_id, expira_en FROM sesiones WHERE token_hash = ?')
    .get(hashearToken(token)) as unknown as { usuario_id: number; expira_en: string } | undefined;

  if (!fila) return undefined;

  if (new Date(fila.expira_en).getTime() <= Date.now()) {
    base.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashearToken(token));
    return undefined;
  }

  const usuario = buscarPorId(fila.usuario_id);
  if (!usuario || !usuario.activo) return undefined;
  return usuario;
}

/** Cierra una sesión concreta. No falla si el token ya no existe. */
export function cerrarSesion(token: string | undefined): void {
  if (!token) return;
  obtenerBaseAcceso().prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashearToken(token));
}

/** Borra las sesiones vencidas. Se ejecuta al abrir cada sesión nueva. */
export function purgarSesionesVencidas(): void {
  obtenerBaseAcceso().prepare('DELETE FROM sesiones WHERE expira_en <= ?').run(ahora());
}
