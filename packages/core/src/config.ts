import { config as cargarDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Modos de tratamiento de datos personales soportados por WiBot. */
export type ModoPrivacidad = 'aggregate' | 'masked' | 'full';

export interface ConfiguracionWiBot {
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    socketPath?: string;
    prefijoTablas: string;
  };
  limiteFilas: number;
  timeoutConsultaMs: number;
  modoPrivacidad: ModoPrivacidad;
  zonaHoraria: string;
}

/** Busca el archivo .env subiendo desde un directorio hasta la raíz. */
function buscarEnvHaciaArriba(desde: string): string | undefined {
  let actual = resolve(desde);
  for (let i = 0; i < 8; i += 1) {
    const candidato = resolve(actual, '.env');
    if (existsSync(candidato)) return candidato;
    const padre = dirname(actual);
    if (padre === actual) break;
    actual = padre;
  }
  return undefined;
}

/**
 * Ubica el .env del proyecto.
 *
 * Busca primero junto al propio módulo y después desde el directorio de
 * trabajo: un cliente MCP arranca el servidor desde cualquier carpeta, así que
 * depender del cwd hacía que no encontrara la configuración y no levantara.
 */
export function ubicarEnv(): string | undefined {
  const propio = dirname(fileURLToPath(import.meta.url));
  return buscarEnvHaciaArriba(propio) ?? buscarEnvHaciaArriba(process.cwd());
}

/** Raíz del proyecto, deducida de dónde está el .env. */
export function raizDelProyecto(): string {
  const rutaEnv = ubicarEnv();
  return rutaEnv ? dirname(rutaEnv) : process.cwd();
}

let cacheConfiguracion: ConfiguracionWiBot | undefined;

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const numero = Number.parseInt(valor, 10);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(`Configuración inválida: ${nombre} debe ser un entero positivo, llegó "${valor}"`);
  }
  return numero;
}

function leerModoPrivacidad(valor: string | undefined): ModoPrivacidad {
  const normalizado = (valor ?? 'aggregate').trim().toLowerCase();
  if (normalizado === 'aggregate' || normalizado === 'masked' || normalizado === 'full') {
    return normalizado;
  }
  throw new Error(`Configuración inválida: PII_MODE debe ser aggregate | masked | full, llegó "${valor}"`);
}

/**
 * Devuelve la configuración de WiBot leída del entorno, cacheada tras la primera llamada.
 * Valida todos los campos y falla con un mensaje explícito si falta algo crítico.
 *
 * @throws {Error} si falta una variable obligatoria o un valor no es válido.
 */
export function obtenerConfiguracion(): ConfiguracionWiBot {
  if (cacheConfiguracion) return cacheConfiguracion;

  const rutaEnv = ubicarEnv();
  if (rutaEnv) cargarDotenv({ path: rutaEnv, override: false });

  const database = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  if (!database) throw new Error('Falta DB_NAME en el entorno (.env)');
  if (!user) throw new Error('Falta DB_USER en el entorno (.env)');

  const socket = process.env.DB_SOCKET?.trim();

  cacheConfiguracion = {
    db: {
      host: process.env.DB_HOST?.trim() || '127.0.0.1',
      port: leerEntero(process.env.DB_PORT, 3306, 'DB_PORT'),
      user,
      password: process.env.DB_PASSWORD ?? '',
      database,
      ...(socket ? { socketPath: socket } : {}),
      prefijoTablas: process.env.DB_TABLE_PREFIX?.trim() || '',
    },
    limiteFilas: leerEntero(process.env.QUERY_ROW_LIMIT, 500, 'QUERY_ROW_LIMIT'),
    timeoutConsultaMs: leerEntero(process.env.QUERY_TIMEOUT_MS, 15000, 'QUERY_TIMEOUT_MS'),
    modoPrivacidad: leerModoPrivacidad(process.env.PII_MODE),
    zonaHoraria: process.env.WIBOT_TIMEZONE?.trim() || 'America/Santiago',
  };

  return cacheConfiguracion;
}

/** Limpia la configuración cacheada. Solo para tests. */
export function reiniciarConfiguracion(): void {
  cacheConfiguracion = undefined;
}
