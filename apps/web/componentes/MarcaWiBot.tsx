/**
 * Marca de WiBot: un instrumento de taller mirando de frente.
 * Los dos ojos laten cuando el bot está trabajando.
 */
export function MarcaWiBot({ tamano = 40, activo = false }: { tamano?: number; activo?: boolean }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 40 40"
      role="img"
      aria-label="WiBot"
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id="marca-wibot-recorte">
          <rect x="6" y="10" width="28" height="22" rx="9" />
        </clipPath>
      </defs>
      <rect x="6" y="10" width="28" height="22" rx="9" fill="#101a15" stroke="#24352c" strokeWidth="1.5" />
      <path d="M20 10V5" stroke="#24352c" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="4" r="2.2" fill={activo ? '#2fe87c' : '#24352c'} />
      <g clipPath="url(#marca-wibot-recorte)">
        <circle cx="14.5" cy="21" r="3" fill="#2fe87c">
          {activo ? (
            <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />
          ) : null}
        </circle>
        <circle cx="25.5" cy="21" r="3" fill="#2fe87c">
          {activo ? (
            <animate
              attributeName="opacity"
              values="1;0.35;1"
              dur="1.4s"
              begin="0.2s"
              repeatCount="indefinite"
            />
          ) : null}
        </circle>
      </g>
    </svg>
  );
}
