import type { CSSProperties } from 'react';
import estilos from './orbe.module.css';

/** Estados del orbe, del más quieto al más activo, más el de falla. */
export type EstadoOrbe = 'reposo' | 'escuchando' | 'pensando' | 'generando' | 'error';

const TAMANO_POR_DEFECTO = 40;

const DESCRIPCION: Record<EstadoOrbe, string> = {
  reposo: 'Thinking Orb en reposo',
  escuchando: 'Thinking Orb escuchando',
  pensando: 'Thinking Orb pensando',
  generando: 'Thinking Orb respondiendo',
  error: 'Thinking Orb con un problema',
};

interface Props {
  /** Diámetro en píxeles. Los valores no positivos caen al tamaño por defecto. */
  tamano?: number;
  estado?: EstadoOrbe;
  /** Reemplaza la descripción accesible cuando el contexto ya dice otra cosa. */
  etiqueta?: string;
}

/**
 * Wiwo Thinking Orb: la marca viva del producto. Un vidrio de luz sobre tinta
 * cuyo ritmo, brillo y deformación comunican en qué está el sistema.
 *
 * @param tamano Diámetro del orbe en píxeles.
 * @param estado Momento del ciclo que debe representar.
 * @param etiqueta Texto alternativo accesible.
 */
export function OrbePensante({ tamano, estado = 'reposo', etiqueta }: Props) {
  const diametro = typeof tamano === 'number' && Number.isFinite(tamano) && tamano > 0 ? tamano : TAMANO_POR_DEFECTO;
  const variables = { '--orbe-tamano': `${diametro}px` } as CSSProperties;

  return (
    <div
      className={estilos.escena}
      data-estado={estado}
      style={variables}
      role="img"
      aria-label={etiqueta ?? DESCRIPCION[estado]}
    >
      <span className={estilos.halo} aria-hidden="true" />
      <span className={estilos.anillo} aria-hidden="true" />
      <span className={estilos.anilloAlterno} aria-hidden="true" />

      <div className={estilos.orbe} aria-hidden="true">
        <span className={estilos.pulso} />
        <span className={`${estilos.pulso} ${estilos.pulsoDos}`} />
        <span className={`${estilos.aurora} ${estilos.auroraUno}`} />
        <span className={`${estilos.aurora} ${estilos.auroraDos}`} />
        <span className={`${estilos.aurora} ${estilos.auroraTres}`} />
        <span className={estilos.borde} />
        <span className={estilos.nucleo} />
        <span className={estilos.destello} />
      </div>

      <span className={estilos.particula} aria-hidden="true" />
      <span className={`${estilos.particula} ${estilos.particulaDos}`} aria-hidden="true" />
      <span className={`${estilos.particula} ${estilos.particulaTres}`} aria-hidden="true" />
    </div>
  );
}
