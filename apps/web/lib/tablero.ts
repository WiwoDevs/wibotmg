import 'server-only';
import {
  analizarEncuestas,
  analizarLeads,
  analizarLlamadas,
  hayBaseGestion,
  listarAnexos,
  ranking,
  resumenOperacion,
  serieTemporal,
} from '@wibot/core';

/** Período que cubre el tablero. */
export interface PeriodoTablero {
  desde: string;
  hasta: string;
  etiqueta: string;
}

export interface Indicador {
  clave: string;
  etiqueta: string;
  valor: number | null;
  /** Unidad o sufijo a mostrar junto al número. */
  sufijo?: string;
  /** Dato secundario que da contexto al indicador. */
  apoyo?: string;
}

export interface FilaBarra {
  etiqueta: string;
  valor: number;
  /** Texto que acompaña a la barra, por ejemplo la participación. */
  detalle?: string;
}

export interface PuntoSerie {
  intervalo: string;
  valor: number;
}

export interface TramoApilado {
  etiqueta: string;
  valor: number;
  /** Nombre del token de color en el sistema visual. */
  tono: 'calor-4' | 'calor-3' | 'calor-2' | 'calor-1';
}

export interface DatosTablero {
  periodo: PeriodoTablero;
  generadoEn: string;
  /** false cuando el SQLite de gestión todavía no fue importado. */
  hayGestion: boolean;
  indicadores: Indicador[];
  serieCupones: PuntoSerie[];
  concesionarios: FilaBarra[];
  temperaturaLeads: TramoApilado[];
  puntosDeVenta: FilaBarra[];
  nps: FilaBarra[];
  anexos: FilaBarra[];
  telefonia: { atendidas: number; sinAtender: number; enEspera: number };
}

/** Respuestas mínimas exigidas para que un NPS por concesionario sea comparable. */
const MINIMO_RESPUESTAS_NPS = 20;

function redondear(valor: number | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor.toFixed(1));
}

/**
 * Reúne en una sola pasada todo lo que muestra el tablero.
 *
 * Las cuatro fuentes se consultan en paralelo; si la base de gestión todavía no
 * fue importada, la parte de encuestas, leads y telefonía vuelve vacía y el
 * tablero lo dice, en vez de fallar entera.
 *
 * @param desde fecha inicial YYYY-MM-DD.
 * @param hasta fecha final YYYY-MM-DD.
 * @throws {Error} si la base de cupones no responde.
 */
export async function armarTablero(desde: string, hasta: string): Promise<DatosTablero> {
  const periodoEntrada = { desde, hasta };
  const gestionDisponible = hayBaseGestion();

  const [resumen, porConcesionario, serie] = await Promise.all([
    resumenOperacion(periodoEntrada),
    ranking('concesionario', periodoEntrada, {}, 8),
    serieTemporal('dia', periodoEntrada, {}),
  ]);

  const encuestas = gestionDisponible ? analizarEncuestas('total', periodoEntrada, {}, 1) : null;
  const encuestasPorConcesionario = gestionDisponible
    ? analizarEncuestas('concesionario', periodoEntrada, {}, 40)
    : null;
  const leads = gestionDisponible ? analizarLeads('total', periodoEntrada, {}, 1) : null;
  const leadsPorPunto = gestionDisponible ? analizarLeads('punto_venta', periodoEntrada, {}, 6) : null;
  const llamadasPorEstado = gestionDisponible ? analizarLlamadas('estado', periodoEntrada, {}, 10) : null;
  const llamadasTotal = gestionDisponible ? analizarLlamadas('total', periodoEntrada, {}, 1) : null;
  const anexos = gestionDisponible ? listarAnexos(40) : [];

  const totalEncuestas = encuestas?.filas[0];
  const totalLeads = leads?.filas[0];
  const totalLlamadas = llamadasTotal?.filas[0];

  const porEstado = new Map(
    (llamadasPorEstado?.filas ?? []).map((fila) => [fila.etiqueta, fila.llamadas]),
  );

  const indicadores: Indicador[] = [
    {
      clave: 'cupones',
      etiqueta: 'Cupones de servicio',
      valor: resumen.cupones,
      apoyo: `${resumen.locales} locales · ${resumen.asesores} asesores`,
    },
    {
      clave: 'nps',
      etiqueta: 'NPS de posventa',
      valor: redondear(totalEncuestas?.nps ?? null),
      apoyo: totalEncuestas ? `${totalEncuestas.respuestas} respuestas` : 'sin encuestas cargadas',
    },
    {
      clave: 'leads',
      etiqueta: 'Leads del CRM',
      valor: totalLeads?.leads ?? null,
      apoyo: totalLeads ? `${totalLeads.superCalientes} súper calientes` : 'sin leads cargados',
    },
    {
      clave: 'atencion',
      etiqueta: 'Atención telefónica',
      valor: redondear(totalLlamadas?.porcentajeAtencion ?? null),
      sufijo: '%',
      apoyo: totalLlamadas ? `${totalLlamadas.llamadas.toLocaleString('es-CL')} llamadas` : 'sin llamadas cargadas',
    },
  ];

  return {
    periodo: { desde, hasta, etiqueta: resumen.periodo.etiqueta },
    generadoEn: new Date().toISOString(),
    hayGestion: gestionDisponible,
    indicadores,
    serieCupones: serie.puntos.map((punto) => ({ intervalo: punto.intervalo, valor: punto.cupones })),
    concesionarios: porConcesionario.filas.map((fila) => ({
      etiqueta: fila.etiqueta,
      valor: fila.cupones,
      detalle: `${fila.participacion.toString().replace('.', ',')} %`,
    })),
    temperaturaLeads: totalLeads
      ? ([
          { etiqueta: 'Súper caliente', valor: totalLeads.superCalientes, tono: 'calor-4' },
          { etiqueta: 'Caliente', valor: totalLeads.calientes, tono: 'calor-3' },
          { etiqueta: 'Tibio', valor: totalLeads.tibios, tono: 'calor-2' },
          { etiqueta: 'Frío', valor: totalLeads.frios, tono: 'calor-1' },
        ] satisfies TramoApilado[]).filter((tramo) => tramo.valor > 0)
      : [],
    puntosDeVenta: (leadsPorPunto?.filas ?? []).map((fila) => ({
      etiqueta: fila.etiqueta,
      valor: fila.leads,
      detalle: `${fila.superCalientes} súper calientes`,
    })),
    nps: (encuestasPorConcesionario?.filas ?? [])
      .filter((fila) => fila.respuestas >= MINIMO_RESPUESTAS_NPS && fila.nps !== null)
      .sort((a, b) => (b.nps ?? 0) - (a.nps ?? 0))
      .slice(0, 8)
      .map((fila) => ({
        etiqueta: fila.etiqueta,
        valor: fila.nps ?? 0,
        detalle: `${fila.respuestas} respuestas`,
      })),
    anexos: anexos
      .filter((anexo) => anexo.totalPerdidas > 0)
      .sort((a, b) => b.totalPerdidas - a.totalPerdidas)
      .slice(0, 6)
      .map((anexo) => ({
        etiqueta: anexo.anexo,
        valor: anexo.totalPerdidas,
        detalle: `${anexo.porcentajeAtencion ?? 0} % atendidas`,
      })),
    telefonia: {
      atendidas: porEstado.get('Answered') ?? 0,
      sinAtender: porEstado.get('Unanswered') ?? 0,
      enEspera: porEstado.get('Waiting') ?? 0,
    },
  };
}
