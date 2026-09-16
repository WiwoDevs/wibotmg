import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let base: DatabaseSync | undefined;
let rutaResuelta: string | undefined;

/** Busca la raíz del proyecto subiendo hasta encontrar el .env. */
function raizDelProyecto(): string {
  let actual = resolve(process.cwd());
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(actual, '.env'))) return actual;
    const padre = dirname(actual);
    if (padre === actual) break;
    actual = padre;
  }
  return process.cwd();
}

/** Ruta del SQLite con los datos de gestión importados desde los Excel. */
export function rutaBaseGestion(): string {
  if (rutaResuelta) return rutaResuelta;
  const relativa = process.env.WIBOT_DATOS_DB?.trim() || '.data/wibot-datos.sqlite';
  rutaResuelta = resolve(raizDelProyecto(), relativa);
  return rutaResuelta;
}

/** Indica si el SQLite de gestión existe. Si no, las herramientas lo dicen. */
export function hayBaseGestion(): boolean {
  return existsSync(rutaBaseGestion());
}

/**
 * Devuelve la conexión de solo lectura al SQLite de gestión.
 * @throws {Error} si el archivo todavía no fue generado.
 */
export function obtenerBaseGestion(): DatabaseSync {
  if (base) return base;
  const ruta = rutaBaseGestion();
  if (!existsSync(ruta)) {
    throw new Error(
      `No existe la base de gestión en ${ruta}. Generala con: npm run datos:importar`,
    );
  }
  base = new DatabaseSync(ruta, { readOnly: true });
  return base;
}

/** Cierra la conexión. Útil al apagar el proceso. */
export function cerrarBaseGestion(): void {
  base?.close();
  base = undefined;
}

/**
 * Ejecuta una consulta de lectura sobre el SQLite de gestión.
 *
 * @param sql sentencia SELECT ya validada.
 * @param parametros valores para los placeholders.
 * @returns las filas como objetos planos.
 */
export function consultarGestion<T = Record<string, unknown>>(
  sql: string,
  parametros: ReadonlyArray<unknown> = [],
): T[] {
  const sentencia = obtenerBaseGestion().prepare(sql);
  return sentencia.all(...(parametros as never[])) as unknown as T[];
}

/** Ejecuta una consulta que devuelve una sola fila. */
export function consultarGestionUna<T = Record<string, unknown>>(
  sql: string,
  parametros: ReadonlyArray<unknown> = [],
): T | undefined {
  const sentencia = obtenerBaseGestion().prepare(sql);
  return sentencia.get(...(parametros as never[])) as unknown as T | undefined;
}
