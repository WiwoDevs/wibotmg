'use client';

import { IDIOMAS, NOMBRE_IDIOMA } from '@/lib/idioma';
import { useIdioma } from './ProveedorIdioma';
import estilos from './selector-idioma.module.css';

/** Botonera para pasar la interfaz y las respuestas del modelo a otro idioma. */
export function SelectorIdioma() {
  const { idioma, cambiarIdioma, textos } = useIdioma();

  return (
    <div className={estilos.selector} role="group" aria-label={textos.comun.idioma}>
      {IDIOMAS.map((opcion) => (
        <button
          key={opcion}
          type="button"
          className={estilos.opcion}
          aria-pressed={opcion === idioma}
          onClick={() => opcion !== idioma && cambiarIdioma(opcion)}
        >
          {NOMBRE_IDIOMA[opcion]}
        </button>
      ))}
    </div>
  );
}
