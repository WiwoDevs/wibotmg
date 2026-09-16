import { obtenerConfiguracion } from './config.js';

/** Períodos relativos que WiBot entiende sin que le den fechas explícitas. */
export type PeriodoRelativo =
  | 'hoy'
  | 'ayer'
  | 'ultimos_7_dias'
  | 'ultimos_30_dias'
  | 'mes_actual'
  | 'mes_anterior'
  | 'anio_actual'
  | 'todo';

export interface Periodo {
  /** Fecha inicial inclusive, formato YYYY-MM-DD. */
  desde: string;
  /** Fecha final inclusive, formato YYYY-MM-DD. */
  hasta: string;
  /** Texto legible para mostrarle a la persona. */
  etiqueta: string;
}

const FECHA_MINIMA = '2000-01-01';

/** Devuelve la fecha de hoy en la zona horaria configurada, como YYYY-MM-DD. */
export function hoyLocal(): string {
  const { zonaHoraria } = obtenerConfiguracion();
  const formateador = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formateador.format(new Date());
}

function sumarDias(fechaIso: string, dias: number): string {
  const base = new Date(`${fechaIso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function primerDiaDelMes(fechaIso: string): string {
  return `${fechaIso.slice(0, 7)}-01`;
}

function ultimoDiaDelMes(fechaIso: string): string {
  const [anio, mes] = fechaIso.split('-').map(Number);
  const fin = new Date(Date.UTC(anio ?? 1970, mes ?? 1, 0));
  return fin.toISOString().slice(0, 10);
}

function esFechaIso(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}

export interface EntradaPeriodo {
  relativo?: PeriodoRelativo;
  desde?: string;
  hasta?: string;
}

/**
 * Convierte un período relativo o un par de fechas en un rango concreto.
 * Si no se especifica nada, devuelve el mes actual.
 *
 * @param entrada período relativo, o fechas explícitas en formato YYYY-MM-DD.
 * @throws {Error} si una fecha explícita es inválida o el rango está invertido.
 */
export function resolverPeriodo(entrada: EntradaPeriodo = {}): Periodo {
  if (entrada.desde || entrada.hasta) {
    const desde = entrada.desde ?? FECHA_MINIMA;
    const hasta = entrada.hasta ?? hoyLocal();
    if (!esFechaIso(desde)) throw new Error(`Fecha "desde" inválida: ${desde} (se espera YYYY-MM-DD)`);
    if (!esFechaIso(hasta)) throw new Error(`Fecha "hasta" inválida: ${hasta} (se espera YYYY-MM-DD)`);
    if (desde > hasta) throw new Error(`El rango está invertido: desde ${desde} es posterior a hasta ${hasta}`);
    return { desde, hasta, etiqueta: `del ${desde} al ${hasta}` };
  }

  const hoy = hoyLocal();

  switch (entrada.relativo ?? 'mes_actual') {
    case 'hoy':
      return { desde: hoy, hasta: hoy, etiqueta: `hoy (${hoy})` };
    case 'ayer': {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer, etiqueta: `ayer (${ayer})` };
    }
    case 'ultimos_7_dias':
      return { desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: 'últimos 7 días' };
    case 'ultimos_30_dias':
      return { desde: sumarDias(hoy, -29), hasta: hoy, etiqueta: 'últimos 30 días' };
    case 'mes_actual':
      return { desde: primerDiaDelMes(hoy), hasta: hoy, etiqueta: `mes en curso (${hoy.slice(0, 7)})` };
    case 'mes_anterior': {
      const finAnterior = sumarDias(primerDiaDelMes(hoy), -1);
      return {
        desde: primerDiaDelMes(finAnterior),
        hasta: ultimoDiaDelMes(finAnterior),
        etiqueta: `mes anterior (${finAnterior.slice(0, 7)})`,
      };
    }
    case 'anio_actual':
      return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy, etiqueta: `año ${hoy.slice(0, 4)}` };
    case 'todo':
      return { desde: FECHA_MINIMA, hasta: hoy, etiqueta: 'histórico completo' };
    default:
      return { desde: primerDiaDelMes(hoy), hasta: hoy, etiqueta: 'mes en curso' };
  }
}
