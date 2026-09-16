import { ahora, obtenerBaseAcceso } from './base.js';
import { obtenerConfiguracionAcceso } from './config.js';
import { normalizarCorreo } from './usuarios.js';

export interface EstadoBloqueo {
  bloqueado: boolean;
  /** Minutos que faltan para poder reintentar. Cero si no está bloqueado. */
  minutosRestantes: number;
}

/**
 * Indica si un correo o una dirección IP agotaron los intentos permitidos.
 * Se cuenta cualquiera de los dos por separado: así un atacante no puede
 * probar contraseñas contra muchas cuentas desde la misma IP.
 *
 * @param correo correo que se está intentando usar.
 * @param ip dirección desde la que llega el intento.
 */
export function revisarBloqueo(correo: string, ip: string): EstadoBloqueo {
  const { intentosMaximos, minutosBloqueo } = obtenerConfiguracionAcceso();
  const desde = new Date(Date.now() - minutosBloqueo * 60 * 1000).toISOString();

  const fila = obtenerBaseAcceso()
    .prepare(
      `SELECT COUNT(*) AS fallidos, MIN(ocurrido_en) AS primero
         FROM intentos
        WHERE exito = 0 AND ocurrido_en >= ? AND (correo = ? OR ip = ?)`,
    )
    .get(desde, normalizarCorreo(correo), ip) as { fallidos: number; primero: string | null } | undefined;

  const fallidos = fila?.fallidos ?? 0;
  if (fallidos < intentosMaximos || !fila?.primero) {
    return { bloqueado: false, minutosRestantes: 0 };
  }

  const liberaEn = new Date(fila.primero).getTime() + minutosBloqueo * 60 * 1000;
  const restantes = Math.max(Math.ceil((liberaEn - Date.now()) / 60000), 1);
  return { bloqueado: true, minutosRestantes: restantes };
}

/**
 * Deja constancia de un intento de inicio de sesión.
 * Un intento exitoso limpia los fallidos previos de ese correo.
 */
export function registrarIntento(correo: string, ip: string, exito: boolean): void {
  const base = obtenerBaseAcceso();
  const correoNormalizado = normalizarCorreo(correo);

  base
    .prepare('INSERT INTO intentos (correo, ip, exito, ocurrido_en) VALUES (?, ?, ?, ?)')
    .run(correoNormalizado, ip, exito ? 1 : 0, ahora());

  if (exito) {
    base.prepare('DELETE FROM intentos WHERE correo = ? AND exito = 0').run(correoNormalizado);
  }

  const limite = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  base.prepare('DELETE FROM intentos WHERE ocurrido_en < ?').run(limite);
}
