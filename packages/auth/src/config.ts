import { config as cargarDotenv } from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface ConfiguracionAcceso {
  /** Ruta del archivo SQLite con usuarios, sesiones y auditoría. */
  rutaBase: string;
  /** Horas que dura una sesión desde el último uso. */
  horasSesion: number;
  /** Intentos fallidos permitidos antes de bloquear temporalmente. */
  intentosMaximos: number;
  /** Minutos que dura el bloqueo tras agotar los intentos. */
  minutosBloqueo: number;
  /** Largo mínimo exigido a una contraseña. */
  largoMinimoContrasena: number;
}

/** Busca el archivo .env subiendo desde el directorio actual hasta la raíz. */
function buscarEnvHaciaArriba(desde: string): string | undefined {
  let actual = resolve(desde);
  for (let i = 0; i < 6; i += 1) {
    const candidato = resolve(actual, '.env');
    if (existsSync(candidato)) return candidato;
    const padre = dirname(actual);
    if (padre === actual) break;
    actual = padre;
  }
  return undefined;
}

/** Devuelve la raíz del repositorio, ubicada por la presencia del .env. */
function raizDelProyecto(): string {
  const rutaEnv = buscarEnvHaciaArriba(process.cwd());
  return rutaEnv ? dirname(rutaEnv) : process.cwd();
}

let cache: ConfiguracionAcceso | undefined;

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const numero = Number.parseInt(valor, 10);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(`Configuración inválida: ${nombre} debe ser un entero positivo, llegó "${valor}"`);
  }
  return numero;
}

/**
 * Configuración del control de acceso, cacheada tras la primera llamada.
 * Crea el directorio del archivo SQLite si todavía no existe.
 */
export function obtenerConfiguracionAcceso(): ConfiguracionAcceso {
  if (cache) return cache;

  const raiz = raizDelProyecto();
  const rutaEnv = resolve(raiz, '.env');
  if (existsSync(rutaEnv)) cargarDotenv({ path: rutaEnv, override: false });

  const rutaRelativa = process.env.WIBOT_AUTH_DB?.trim() || '.data/wibot.sqlite';
  const rutaBase = resolve(raiz, rutaRelativa);
  mkdirSync(dirname(rutaBase), { recursive: true });

  cache = {
    rutaBase,
    horasSesion: leerEntero(process.env.WIBOT_SESSION_HOURS, 12, 'WIBOT_SESSION_HOURS'),
    intentosMaximos: leerEntero(process.env.WIBOT_MAX_INTENTOS, 5, 'WIBOT_MAX_INTENTOS'),
    minutosBloqueo: leerEntero(process.env.WIBOT_MINUTOS_BLOQUEO, 15, 'WIBOT_MINUTOS_BLOQUEO'),
    largoMinimoContrasena: leerEntero(process.env.WIBOT_LARGO_MINIMO, 12, 'WIBOT_LARGO_MINIMO'),
  };

  return cache;
}
