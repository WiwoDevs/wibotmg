import { config as cargarDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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

/**
 * Busca el archivo .env subiendo desde el directorio actual hasta la raíz.
 * Permite que el MCP y la web compartan un único .env en la raíz del repo.
 */
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

  const rutaEnv = buscarEnvHaciaArriba(process.cwd());
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
