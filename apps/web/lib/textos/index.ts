import type { Idioma } from '../idioma';
import { textosBloques } from './bloques';
import { textosChat } from './chat';
import { textosComun } from './comun';
import { textosEntrar } from './entrar';
import { textosServidor } from './servidor';
import { textosTablero } from './tablero';

/**
 * Devuelve todos los textos de la interfaz en un idioma, agrupados por pantalla.
 *
 * @param idioma idioma ya validado.
 */
export function obtenerTextos(idioma: Idioma) {
  return {
    comun: textosComun[idioma],
    chat: textosChat[idioma],
    bloques: textosBloques[idioma],
    tablero: textosTablero[idioma],
    entrar: textosEntrar[idioma],
    servidor: textosServidor[idioma],
  };
}

export type Textos = ReturnType<typeof obtenerTextos>;
