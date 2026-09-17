import { Fragment } from 'react';
import estilos from './conversacion.module.css';

/**
 * Renderiza el texto del modelo respetando el único marcado que usa: **negrita**.
 * No interpreta HTML ni ningún otro marcado, así que el contenido del modelo
 * nunca puede inyectar elementos en la página.
 *
 * @param texto texto plano, posiblemente con tramos entre dobles asteriscos.
 */
export function TextoRico({ texto }: { texto: string }) {
  const tramos = texto.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {tramos.map((tramo, indice) => {
        if (tramo.startsWith('**') && tramo.endsWith('**') && tramo.length > 4) {
          return (
            <strong className={estilos.fuerte} key={indice}>
              {tramo.slice(2, -2)}
            </strong>
          );
        }
        return <Fragment key={indice}>{tramo}</Fragment>;
      })}
    </>
  );
}
