'use client';

import { useId, useState } from 'react';
import type { FilaBarra, PuntoSerie, TramoApilado } from '@/lib/tablero';
import estilos from './graficos.module.css';

/** Formatea un entero con separador de miles chileno. */
function numero(valor: number): string {
  return new Intl.NumberFormat('es-CL').format(valor);
}

/** Convierte 2026-08-19 en "19 ago". */
function diaCorto(iso: string): string {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [, mes, dia] = iso.split('-');
  const indice = Number(mes) - 1;
  return `${Number(dia)} ${meses[indice] ?? ''}`.trim();
}

interface Sugerencia {
  texto: string;
  x: number;
  y: number;
}

/**
 * Serie de barras por día. El eje se rotula solo en los extremos y en el pico,
 * que es la información que alguien busca de un vistazo.
 */
export function SerieDiaria({ puntos }: { puntos: PuntoSerie[] }) {
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);

  if (puntos.length === 0) {
    return <p className={estilos.vacio}>Sin movimientos en este período.</p>;
  }

  const maximo = puntos.reduce((tope, punto) => Math.max(tope, punto.valor), 0) || 1;
  const indicePico = puntos.reduce((mejor, punto, indice) => (punto.valor > (puntos[mejor]?.valor ?? 0) ? indice : mejor), 0);
  const paso = 100 / puntos.length;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const pico = puntos[indicePico];

  return (
    <div className={estilos.contenedor}>
      <svg
        className={estilos.lienzoSerie}
        viewBox="0 0 100 42"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Serie de ${puntos.length} días. Máximo ${maximo} el ${pico ? diaCorto(pico.intervalo) : ''}.`}
      >
        {puntos.map((punto, indice) => {
          const alto = (punto.valor / maximo) * 40;
          const x = indice * paso;
          return (
            <rect
              key={punto.intervalo}
              className={`${estilos.barraSerie} ${indice === indicePico ? estilos.barraPico : ''}`}
              x={x + paso * 0.16}
              y={42 - Math.max(alto, 0.8)}
              width={Math.max(paso * 0.68, 0.6)}
              height={Math.max(alto, 0.8)}
              rx={0.6}
              onMouseEnter={(evento) =>
                setSugerencia({
                  texto: `${diaCorto(punto.intervalo)}: ${numero(punto.valor)}`,
                  x: evento.clientX,
                  y: evento.clientY,
                })
              }
              onMouseLeave={() => setSugerencia(null)}
            />
          );
        })}
      </svg>

      <div className={estilos.ejeSerie}>
        <span>{primero ? diaCorto(primero.intervalo) : ''}</span>
        <span className={estilos.marcaPico}>
          pico {pico ? diaCorto(pico.intervalo) : ''} · {numero(maximo)}
        </span>
        <span>{ultimo ? diaCorto(ultimo.intervalo) : ''}</span>
      </div>

      {sugerencia ? (
        <span className={estilos.globo} style={{ left: sugerencia.x, top: sugerencia.y }}>
          {sugerencia.texto}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Ranking en barras horizontales, con la etiqueta y el valor siempre visibles:
 * la longitud compara, el número precisa.
 *
 * @param filas datos ya ordenados de mayor a menor.
 * @param sufijo texto que sigue al valor, por ejemplo "%".
 */
export function BarrasHorizontales({
  filas,
  sufijo = '',
  destacarPrimera = true,
}: {
  filas: FilaBarra[];
  sufijo?: string;
  destacarPrimera?: boolean;
}) {
  if (filas.length === 0) {
    return <p className={estilos.vacio}>Sin datos en este período.</p>;
  }

  const maximo = filas.reduce((tope, fila) => Math.max(tope, fila.valor), 0) || 1;

  return (
    <ul className={estilos.listaBarras}>
      {filas.map((fila, indice) => (
        <li className={estilos.filaBarra} key={fila.etiqueta}>
          <span className={estilos.etiquetaBarra} title={fila.etiqueta}>
            {fila.etiqueta}
          </span>
          <span className={estilos.valorBarra}>
            {numero(fila.valor)}
            {sufijo}
            {fila.detalle ? <span className={estilos.detalleBarra}>{fila.detalle}</span> : null}
          </span>
          <span className={estilos.carril}>
            <span
              className={`${estilos.relleno} ${destacarPrimera && indice === 0 ? estilos.rellenoLider : ''}`}
              style={{ width: `${Math.max((fila.valor / maximo) * 100, 1.5)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Barra apilada con leyenda numerada. La escala de temperatura es ordinal, así
 * que los tramos van siempre del más caliente al más frío, nunca reordenados
 * por tamaño.
 */
export function BarraApilada({ tramos }: { tramos: TramoApilado[] }) {
  const total = tramos.reduce((suma, tramo) => suma + tramo.valor, 0);

  if (total === 0) {
    return <p className={estilos.vacio}>Sin leads en este período.</p>;
  }

  return (
    <div className={estilos.apilada}>
      <div className={estilos.pila} role="img" aria-label={tramos.map((t) => `${t.etiqueta}: ${t.valor}`).join('; ')}>
        {tramos.map((tramo) => (
          <span
            key={tramo.etiqueta}
            className={`${estilos.tramo} ${estilos[tramo.tono] ?? ''}`}
            style={{ width: `${(tramo.valor / total) * 100}%` }}
            title={`${tramo.etiqueta}: ${numero(tramo.valor)}`}
          />
        ))}
      </div>
      <ul className={estilos.leyenda}>
        {tramos.map((tramo) => (
          <li className={estilos.itemLeyenda} key={tramo.etiqueta}>
            <span className={`${estilos.punto} ${estilos[tramo.tono] ?? ''}`} />
            <span className={estilos.textoLeyenda}>{tramo.etiqueta}</span>
            <span className={estilos.numeroLeyenda}>
              {numero(tramo.valor)}
              <span className={estilos.detalleBarra}>
                {((tramo.valor / total) * 100).toFixed(1).replace('.', ',')} %
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Arco de progreso para una proporción sobre cien, como la tasa de atención.
 * Lleva el número al centro porque es la cifra que se lee, no la forma.
 */
export function Arco({
  porcentaje,
  pie,
}: {
  porcentaje: number | null;
  pie: string;
}) {
  const id = useId();
  const valor = porcentaje === null ? 0 : Math.min(Math.max(porcentaje, 0), 100);
  const radio = 52;
  const largo = Math.PI * radio;

  return (
    <div className={estilos.arco}>
      <svg viewBox="0 0 120 68" className={estilos.lienzoArco} role="img" aria-label={`${valor} por ciento. ${pie}`}>
        <path
          d={`M 8 60 A ${radio} ${radio} 0 0 1 112 60`}
          className={estilos.arcoFondo}
          fill="none"
          strokeLinecap="round"
        />
        <path
          id={id}
          d={`M 8 60 A ${radio} ${radio} 0 0 1 112 60`}
          className={estilos.arcoValor}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(valor / 100) * largo} ${largo}`}
        />
      </svg>
      <p className={estilos.cifraArco}>
        {porcentaje === null ? '—' : `${valor.toFixed(1).replace('.', ',')} %`}
      </p>
      <p className={estilos.pieArco}>{pie}</p>
    </div>
  );
}
