import 'server-only';

/** Categorías de evento que registra el diagnóstico. */
export type TipoEventoDiagnostico = 'ronda' | 'herramienta' | 'error' | 'turno';

export interface EventoDiagnostico {
  id: string;
  tipo: TipoEventoDiagnostico;
  /** Qué pasó, en una línea. */
  titulo: string;
  /** Milisegundos que tardó el paso, cuando aplica. */
  duracionMs?: number;
  /** Detalle crudo: cuerpo del error, argumentos, SQL ejecutado. */
  detalle?: unknown;
  correo?: string;
  ocurridoEn: string;
}

const MAXIMO_EVENTOS = 200;
const registro: EventoDiagnostico[] = [];

/**
 * Indica si WiWO Me corre en modo diagnóstico.
 * Se activa con `WIBOT_DEV=1`; fuera de eso no se guarda ni se expone nada.
 */
export function esModoDiagnostico(): boolean {
  return process.env.WIBOT_DEV === '1';
}

/**
 * Anota un evento en el registro en memoria, descartando el más viejo
 * cuando se llena. No persiste en disco: es para mirar mientras se desarrolla.
 *
 * @param evento datos del paso que acaba de ocurrir.
 * @returns el evento completo, listo para emitirlo también al navegador.
 */
export function registrarEvento(
  evento: Omit<EventoDiagnostico, 'id' | 'ocurridoEn'>,
): EventoDiagnostico {
  const completo: EventoDiagnostico = {
    ...evento,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ocurridoEn: new Date().toISOString(),
  };

  if (esModoDiagnostico()) {
    registro.push(completo);
    if (registro.length > MAXIMO_EVENTOS) registro.shift();
  }

  return completo;
}

/**
 * Devuelve los eventos registrados, del más reciente al más antiguo.
 * @param limite cantidad máxima a devolver.
 */
export function listarEventos(limite = MAXIMO_EVENTOS): EventoDiagnostico[] {
  return registro.slice(-limite).reverse();
}

/** Vacía el registro. */
export function limpiarEventos(): void {
  registro.length = 0;
}

/**
 * Recorta un valor grande para que quepa en el panel sin volcar miles de filas.
 * @param valor cualquier dato serializable.
 * @param maximo caracteres máximos del texto resultante.
 */
export function recortar(valor: unknown, maximo = 1200): unknown {
  if (typeof valor === 'string') {
    return valor.length > maximo ? `${valor.slice(0, maximo)}… (${valor.length} caracteres)` : valor;
  }
  try {
    const texto = JSON.stringify(valor);
    if (texto.length <= maximo) return valor;
    return `${texto.slice(0, maximo)}… (${texto.length} caracteres)`;
  } catch {
    return String(valor);
  }
}
