/**
 * Set de iconos dibujado para WiBot: un solo trazo (1.5px), esquinas redondeadas
 * y `currentColor` para que el estado lo dé el CSS.
 */

interface PropsIcono {
  tamano?: number;
  className?: string;
}

function Base({ tamano = 18, className, children }: PropsIcono & { children: React.ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Flecha de envío, apuntando hacia arriba. */
export function IconoEnviar(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M12 19V5" />
      <path d="m5.5 11.5 6.5-6.5 6.5 6.5" />
    </Base>
  );
}

/** Cuadrado de detención, para cortar una respuesta en curso. */
export function IconoDetener(props: PropsIcono) {
  return (
    <Base {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Base de datos: marca las consultas que WiBot hizo contra la operación. */
export function IconoBase(props: PropsIcono) {
  return (
    <Base {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </Base>
  );
}

/** Escudo: señala que hay columnas enmascaradas por privacidad. */
export function IconoPrivacidad(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M12 3 5 6v5.5c0 4.1 2.9 7.8 7 9.5 4.1-1.7 7-5.4 7-9.5V6l-7-3Z" />
      <path d="M12 11v3" />
    </Base>
  );
}

/** Triángulo de advertencia para errores y consultas rechazadas. */
export function IconoAlerta(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M12 4.5 3.5 19h17L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 16.8h.01" />
    </Base>
  );
}

/** Chevron para desplegar el detalle de una consulta. */
export function IconoDesplegar(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="m8 10 4 4 4-4" />
    </Base>
  );
}

/** Puerta con flecha: cerrar la sesión. */
export function IconoSalir(props: PropsIcono) {
  return (
    <Base {...props}>
      <path d="M14 20H6.5A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4H14" />
      <path d="M17 15.5 20.5 12 17 8.5" />
      <path d="M20 12h-9" />
    </Base>
  );
}
