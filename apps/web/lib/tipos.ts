import type { FormatoResultado } from '@wibot/core';

/** Un turno de la conversación tal como lo guarda el navegador. */
export interface MensajeChat {
  id: string;
  autor: 'persona' | 'wibot';
  texto: string;
  /** Hora en que se creó el turno, ya formateada para mostrar. */
  hora: string;
  /** Bloques de datos que WiBot obtuvo de la base para responder este turno. */
  bloques: BloqueDatos[];
  /** Consultas que quedaron registradas, para poder auditar de dónde salió el número. */
  consultas: ConsultaRealizada[];
  error?: string;
  enCurso?: boolean;
}

export interface BloqueDatos {
  id: string;
  herramienta: string;
  formato: FormatoResultado;
  resultado: unknown;
}

export interface ConsultaRealizada {
  herramienta: string;
  argumentos: Record<string, unknown>;
}

/** Eventos que el servidor emite en la respuesta NDJSON de /api/chat. */
export type EventoChat =
  | { tipo: 'consultando'; herramienta: string; argumentos: Record<string, unknown> }
  | { tipo: 'datos'; herramienta: string; formato: FormatoResultado; resultado: unknown }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin' };

/** Turno enviado al servidor: solo lo imprescindible para reconstruir el contexto. */
export interface TurnoEnviado {
  autor: 'persona' | 'wibot';
  texto: string;
}
