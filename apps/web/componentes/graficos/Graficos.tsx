'use client';

import { useId, useState } from 'react';
import { formatearDiaCorto, formatearNumero, formatearPorcentaje } from '@/lib/formato';
import type { FilaBarra, PuntoSerie, TramoApilado } from '@/lib/tablero';
import { useIdioma } from '../ProveedorIdioma';
import estilos from './graficos.module.css';

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
  const { locale, textos } = useIdioma();
  const t = textos.bloques.graficos;
  const diaCorto = (iso: string) => formatearDiaCorto(iso, locale);

  if (puntos.length === 0) {
    return <p className={estilos.vacio}>{t.sinMovimientos}</p>;
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
        aria-label={t.descripcionSerie(puntos.length, formatearNumero(maximo, locale), pico ? diaCorto(pico.intervalo) : '')}
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
                  texto: `${diaCorto(punto.intervalo)}: ${formatearNumero(punto.valor, locale)}`,
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
          {t.pico} {pico ? diaCorto(pico.intervalo) : ''} · {formatearNumero(maximo, locale)}
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
  const { locale, textos } = useIdioma();

  if (filas.length === 0) {
    return <p className={estilos.vacio}>{textos.bloques.graficos.sinDatos}</p>;
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
            {formatearNumero(fila.valor, locale)}
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
  const { locale, textos } = useIdioma();
  const total = tramos.reduce((suma, tramo) => suma + tramo.valor, 0);

  if (total === 0) {
    return <p className={estilos.vacio}>{textos.bloques.graficos.sinLeads}</p>;
  }

  return (
    <div className={estilos.apilada}>
      <div className={estilos.pila} role="img" aria-label={tramos.map((tramo) => `${tramo.etiqueta}: ${formatearNumero(tramo.valor, locale)}`).join('; ')}>
        {tramos.map((tramo) => (
          <span
            key={tramo.etiqueta}
            className={`${estilos.tramo} ${estilos[tramo.tono] ?? ''}`}
            style={{ width: `${(tramo.valor / total) * 100}%` }}
            title={`${tramo.etiqueta}: ${formatearNumero(tramo.valor, locale)}`}
          />
        ))}
      </div>
      <ul className={estilos.leyenda}>
        {tramos.map((tramo) => (
          <li className={estilos.itemLeyenda} key={tramo.etiqueta}>
            <span className={`${estilos.punto} ${estilos[tramo.tono] ?? ''}`} />
            <span className={estilos.textoLeyenda}>{tramo.etiqueta}</span>
            <span className={estilos.numeroLeyenda}>
              {formatearNumero(tramo.valor, locale)}
              <span className={estilos.detalleBarra}>{formatearPorcentaje((tramo.valor / total) * 100, locale)}</span>
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
  const { locale, textos } = useIdioma();
  const valor = porcentaje === null ? 0 : Math.min(Math.max(porcentaje, 0), 100);
  const radio = 52;
  const largo = Math.PI * radio;
  const cifra = porcentaje === null ? '—' : formatearPorcentaje(valor, locale);

  return (
    <div className={estilos.arco}>
      <svg viewBox="0 0 120 68" className={estilos.lienzoArco} role="img" aria-label={textos.bloques.graficos.descripcionArco(cifra, pie)}>
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
        {cifra}
      </p>
      <p className={estilos.pieArco}>{pie}</p>
    </div>
  );
}
