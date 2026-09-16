import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { obtenerConfiguracionAcceso } from './config.js';

const scrypt = promisify(scryptCallback) as (
  contrasena: string,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMETROS = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const LARGO_CLAVE = 64;

/**
 * Deriva el hash de una contraseña con scrypt y lo serializa junto a sus parámetros.
 * El formato es `scrypt$N$r$p$sal$hash`, ambos en base64url.
 *
 * @param contrasena contraseña en claro.
 * @throws {Error} si la contraseña no alcanza el largo mínimo configurado.
 */
export async function derivarContrasena(contrasena: string): Promise<string> {
  const { largoMinimoContrasena } = obtenerConfiguracionAcceso();
  if (contrasena.length < largoMinimoContrasena) {
    throw new Error(`La contraseña debe tener al menos ${largoMinimoContrasena} caracteres`);
  }
  const sal = randomBytes(16);
  const clave = await scrypt(contrasena, sal, LARGO_CLAVE, PARAMETROS);
  return [
    'scrypt',
    PARAMETROS.N,
    PARAMETROS.r,
    PARAMETROS.p,
    sal.toString('base64url'),
    clave.toString('base64url'),
  ].join('$');
}

/**
 * Verifica una contraseña contra su hash almacenado, en tiempo constante.
 * Devuelve false ante cualquier hash con formato desconocido en vez de lanzar,
 * para que un registro corrupto no distinga su respuesta de una clave errónea.
 *
 * @param contrasena contraseña en claro que escribió la persona.
 * @param almacenado hash guardado en la base.
 */
export async function verificarContrasena(contrasena: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  const sal = Buffer.from(partes[4] ?? '', 'base64url');
  const esperado = Buffer.from(partes[5] ?? '', 'base64url');

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || esperado.length === 0) {
    return false;
  }

  try {
    const calculado = await scrypt(contrasena, sal, esperado.length, {
      N,
      r,
      p,
      maxmem: PARAMETROS.maxmem,
    });
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/**
 * Genera una contraseña temporal legible, para entregarle a alguien al darlo de alta.
 * @param largo cantidad de caracteres; por defecto 16.
 */
export function generarContrasenaTemporal(largo = 16): string {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(largo);
  let resultado = '';
  for (const byte of bytes) {
    resultado += alfabeto[byte % alfabeto.length];
  }
  return resultado;
}
