import { ahora, obtenerBaseAcceso } from './base.js';

export interface RegistroAuditoria {
  id: number;
  correo: string;
  pregunta: string;
  herramientas: string[];
  conDatosPersonales: boolean;
  ip: string | null;
  ocurridoEn: string;
}

/** Herramientas que devuelven datos personales sin enmascarar. */
const HERRAMIENTAS_SENSIBLES = new Set(['buscar_cliente', 'historial_vehiculo']);

/**
 * Registra una consulta hecha desde el chat: quién preguntó, qué preguntó y
 * qué herramientas terminó usando WiBot para responder.
 *
 * @param usuarioId identificador del usuario, o null si la cuenta ya no existe.
 * @param correo correo de quien preguntó, guardado aparte para que sobreviva a una baja.
 * @param pregunta texto tal como lo escribió la persona.
 * @param herramientas nombres de las herramientas ejecutadas en el turno.
 * @param ip dirección desde la que se hizo la consulta.
 */
export function registrarConsulta(
  usuarioId: number | null,
  correo: string,
  pregunta: string,
  herramientas: string[],
  ip?: string,
): void {
  const sensible = herramientas.some((nombre) => HERRAMIENTAS_SENSIBLES.has(nombre));
  obtenerBaseAcceso()
    .prepare(
      `INSERT INTO auditoria (usuario_id, correo, pregunta, herramientas, con_datos_personales, ip, ocurrido_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      usuarioId,
      correo,
      pregunta.slice(0, 2000),
      JSON.stringify(herramientas),
      sensible ? 1 : 0,
      ip ?? null,
      ahora(),
    );
}

/**
 * Devuelve las últimas consultas registradas, de la más reciente a la más antigua.
 * @param limite cantidad máxima de registros; por defecto 50.
 */
export function listarAuditoria(limite = 50): RegistroAuditoria[] {
  const tope = Math.min(Math.max(Math.trunc(limite) || 50, 1), 1000);
  const filas = obtenerBaseAcceso()
    .prepare(
      `SELECT id, correo, pregunta, herramientas, con_datos_personales, ip, ocurrido_en
         FROM auditoria ORDER BY ocurrido_en DESC LIMIT ?`,
    )
    .all(tope) as Array<{
    id: number;
    correo: string;
    pregunta: string;
    herramientas: string;
    con_datos_personales: number;
    ip: string | null;
    ocurrido_en: string;
  }>;

  return filas.map((fila) => {
    let herramientas: string[] = [];
    try {
      const valor: unknown = JSON.parse(fila.herramientas);
      if (Array.isArray(valor)) herramientas = valor.map(String);
    } catch {
      herramientas = [];
    }
    return {
      id: fila.id,
      correo: fila.correo,
      pregunta: fila.pregunta,
      herramientas,
      conDatosPersonales: fila.con_datos_personales === 1,
      ip: fila.ip,
      ocurridoEn: fila.ocurrido_en,
    };
  });
}
