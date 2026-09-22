import { ahora, obtenerBaseAcceso } from './base.js';
import { derivarContrasena, verificarContrasena } from './contrasenas.js';

export interface Usuario {
  id: number;
  correo: string;
  nombre: string;
  activo: boolean;
  debeCambiar: boolean;
  creadoEn: string;
  ultimoAcceso: string | null;
}

interface FilaUsuario {
  id: number;
  correo: string;
  nombre: string;
  contrasena: string;
  activo: number;
  debe_cambiar: number;
  creado_en: string;
  ultimo_acceso: string | null;
}

function aUsuario(fila: FilaUsuario): Usuario {
  return {
    id: fila.id,
    correo: fila.correo,
    nombre: fila.nombre,
    activo: fila.activo === 1,
    debeCambiar: fila.debe_cambiar === 1,
    creadoEn: fila.creado_en,
    ultimoAcceso: fila.ultimo_acceso,
  };
}

/** Normaliza un correo para que la comparación no dependa de mayúsculas ni espacios. */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/** Largo máximo de un nombre de usuario o correo con el que se inicia sesión. */
const LARGO_MAXIMO_USUARIO = 120;

/**
 * Valida el identificador con el que se inicia sesión: un correo o un nombre de
 * usuario cualquiera, sin espacios. No verifica que exista.
 */
export function esUsuarioValido(usuario: string): boolean {
  return usuario.length > 0 && usuario.length <= LARGO_MAXIMO_USUARIO && !/\s/.test(usuario);
}

/**
 * Da de alta a una persona.
 *
 * @param correo correo con el que iniciará sesión.
 * @param nombre nombre para mostrar en la interfaz.
 * @param contrasena contraseña inicial en claro.
 * @param debeCambiar si true, la interfaz le exigirá cambiarla al entrar.
 * @returns el usuario creado.
 * @throws {Error} si el correo es inválido o ya está registrado.
 */
export async function crearUsuario(
  correo: string,
  nombre: string,
  contrasena: string,
  debeCambiar = true,
): Promise<Usuario> {
  const correoNormalizado = normalizarCorreo(correo);
  if (!esUsuarioValido(correoNormalizado)) {
    throw new Error(`"${correo}" no es un usuario válido: no puede estar vacío ni tener espacios`);
  }
  if (nombre.trim() === '') {
    throw new Error('El nombre no puede estar vacío');
  }
  if (buscarPorCorreo(correoNormalizado)) {
    throw new Error(`Ya existe un usuario con el correo ${correoNormalizado}`);
  }

  const hash = await derivarContrasena(contrasena);
  const base = obtenerBaseAcceso();
  base
    .prepare(
      `INSERT INTO usuarios (correo, nombre, contrasena, activo, debe_cambiar, creado_en)
       VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(correoNormalizado, nombre.trim(), hash, debeCambiar ? 1 : 0, ahora());

  const creado = buscarPorCorreo(correoNormalizado);
  if (!creado) throw new Error('No se pudo crear el usuario');
  return creado;
}

/** Busca un usuario por correo. Devuelve undefined si no existe. */
export function buscarPorCorreo(correo: string): Usuario | undefined {
  const fila = obtenerBaseAcceso()
    .prepare('SELECT * FROM usuarios WHERE correo = ?')
    .get(normalizarCorreo(correo)) as unknown as FilaUsuario | undefined;
  return fila ? aUsuario(fila) : undefined;
}

/** Busca un usuario por su identificador. Devuelve undefined si no existe. */
export function buscarPorId(id: number): Usuario | undefined {
  const fila = obtenerBaseAcceso().prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as
    | FilaUsuario
    | undefined;
  return fila ? aUsuario(fila) : undefined;
}

/** Lista todos los usuarios, del más nuevo al más antiguo. */
export function listarUsuarios(): Usuario[] {
  const filas = obtenerBaseAcceso()
    .prepare('SELECT * FROM usuarios ORDER BY creado_en DESC')
    .all() as unknown as FilaUsuario[];
  return filas.map(aUsuario);
}

/** Indica si ya hay al menos un usuario activo; si no, nadie puede entrar todavía. */
export function hayUsuariosActivos(): boolean {
  const fila = obtenerBaseAcceso()
    .prepare('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1')
    .get() as unknown as { total: number } | undefined;
  return (fila?.total ?? 0) > 0;
}

/**
 * Comprueba las credenciales de una persona.
 *
 * @returns el usuario si la contraseña es correcta y la cuenta está activa; si no, undefined.
 */
export async function verificarCredenciales(
  correo: string,
  contrasena: string,
): Promise<Usuario | undefined> {
  const fila = obtenerBaseAcceso()
    .prepare('SELECT * FROM usuarios WHERE correo = ?')
    .get(normalizarCorreo(correo)) as unknown as FilaUsuario | undefined;

  if (!fila || fila.activo !== 1) return undefined;
  const valida = await verificarContrasena(contrasena, fila.contrasena);
  return valida ? aUsuario(fila) : undefined;
}

/**
 * Cambia la contraseña de un usuario.
 *
 * @param correo correo del usuario.
 * @param nueva contraseña nueva en claro.
 * @param debeCambiar true cuando la contraseña la fija un administrador y la
 *   persona tiene que reemplazarla al entrar; false cuando la eligió ella misma.
 * @throws {Error} si el usuario no existe o la contraseña es demasiado corta.
 */
export async function cambiarContrasena(
  correo: string,
  nueva: string,
  debeCambiar = false,
): Promise<void> {
  const usuario = buscarPorCorreo(correo);
  if (!usuario) throw new Error(`No existe un usuario con el correo ${correo}`);
  const hash = await derivarContrasena(nueva);
  obtenerBaseAcceso()
    .prepare('UPDATE usuarios SET contrasena = ?, debe_cambiar = ? WHERE id = ?')
    .run(hash, debeCambiar ? 1 : 0, usuario.id);
}

/**
 * Activa o desactiva una cuenta. Al desactivarla, cierra todas sus sesiones abiertas.
 * @throws {Error} si el usuario no existe.
 */
export function cambiarActivacion(correo: string, activo: boolean): Usuario {
  const usuario = buscarPorCorreo(correo);
  if (!usuario) throw new Error(`No existe un usuario con el correo ${correo}`);
  const base = obtenerBaseAcceso();
  base.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, usuario.id);
  if (!activo) {
    base.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(usuario.id);
  }
  const actualizado = buscarPorId(usuario.id);
  if (!actualizado) throw new Error('No se pudo actualizar el usuario');
  return actualizado;
}

/** Registra la fecha del último acceso de un usuario. */
export function registrarAcceso(id: number): void {
  obtenerBaseAcceso().prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(ahora(), id);
}
