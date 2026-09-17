import { Fragment, type ReactNode } from 'react';
import estilos from './conversacion.module.css';

/**
 * Parte un tramo de texto en palabras envueltas para poder animarlas una a una.
 * Los espacios se dejan como texto plano para que el `pre-wrap` del contenedor
 * siga respetando saltos de línea y sangrías.
 *
 * @param texto Tramo de texto plano.
 * @param prefijo Prefijo de clave, único por tramo, para que React no reordene.
 * @returns Los nodos del tramo, con cada palabra en su propio elemento.
 */
function envolverPalabras(texto: string, prefijo: number): ReactNode[] {
  return texto
    .split(/(\s+)/)
    .filter((parte) => parte !== '')
    .map((parte, indice) => {
      const clave = `${prefijo}-${indice}`;
      if (/^\s+$/.test(parte)) return <Fragment key={clave}>{parte}</Fragment>;
      return (
        <span className={estilos.palabra} key={clave}>
          {parte}
        </span>
      );
    });
}

/**
 * Renderiza el texto del modelo respetando el único marcado que usa: **negrita**.
 * No interpreta HTML ni ningún otro marcado, así que el contenido del modelo
 * nunca puede inyectar elementos en la página.
 *
 * Cada palabra entra con su propia animación: como el texto llega por streaming
 * y las claves son estables, solo se anima lo que acaba de aparecer.
 *
 * @param texto texto plano, posiblemente con tramos entre dobles asteriscos.
 */
export function TextoRico({ texto }: { texto: string }) {
  if (texto === '') return null;

  const tramos = texto.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {tramos.map((tramo, indice) => {
        if (tramo === '') return null;
        if (tramo.startsWith('**') && tramo.endsWith('**') && tramo.length > 4) {
          return (
            <strong className={estilos.fuerte} key={indice}>
              {envolverPalabras(tramo.slice(2, -2), indice)}
            </strong>
          );
        }
        return <Fragment key={indice}>{envolverPalabras(tramo, indice)}</Fragment>;
      })}
    </>
  );
}
