import { DatabaseSync } from 'node:sqlite';
import { obtenerConfiguracionAcceso } from './config.js';

let base: DatabaseSync | undefined;

/** Crea las tablas si no existen. Es idempotente y corre en cada arranque. */
function migrar(conexion: DatabaseSync): void {
  conexion.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS usuarios (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      correo       TEXT    NOT NULL UNIQUE,
      nombre       TEXT    NOT NULL,
      contrasena   TEXT    NOT NULL,
      activo       INTEGER NOT NULL DEFAULT 1,
      debe_cambiar INTEGER NOT NULL DEFAULT 0,
      creado_en    TEXT    NOT NULL,
      ultimo_acceso TEXT
    );

    CREATE TABLE IF NOT EXISTS sesiones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash  TEXT    NOT NULL UNIQUE,
      creada_en   TEXT    NOT NULL,
      expira_en   TEXT    NOT NULL,
      ip          TEXT,
      agente      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones(token_hash);

    CREATE TABLE IF NOT EXISTS intentos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      correo    TEXT NOT NULL,
      ip        TEXT NOT NULL,
      exito     INTEGER NOT NULL,
      ocurrido_en TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_intentos_correo ON intentos(correo, ocurrido_en);
    CREATE INDEX IF NOT EXISTS idx_intentos_ip ON intentos(ip, ocurrido_en);

    CREATE TABLE IF NOT EXISTS auditoria (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      correo       TEXT    NOT NULL,
      pregunta     TEXT    NOT NULL,
      herramientas TEXT    NOT NULL,
      con_datos_personales INTEGER NOT NULL DEFAULT 0,
      ip           TEXT,
      ocurrido_en  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(ocurrido_en);
  `);
}

/**
 * Devuelve la conexión SQLite del control de acceso, creándola y migrándola
 * en la primera llamada. El archivo vive fuera de la base de MG Contact.
 */
export function obtenerBaseAcceso(): DatabaseSync {
  if (base) return base;
  const { rutaBase } = obtenerConfiguracionAcceso();
  base = new DatabaseSync(rutaBase);
  migrar(base);
  return base;
}

/** Cierra la conexión. Útil al terminar un comando de consola. */
export function cerrarBaseAcceso(): void {
  base?.close();
  base = undefined;
}

/** Marca de tiempo en ISO, el formato en que se guardan todas las fechas. */
export function ahora(): string {
  return new Date().toISOString();
}
