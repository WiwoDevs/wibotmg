'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EventoDiagnosticoCliente } from '@/lib/tipos';
import { IconoAlerta, IconoBase, IconoDesplegar } from './Iconos';
import estilos from './diagnostico.module.css';

interface Props {
  /** Eventos que llegaron por el flujo del turno en curso. */
  enVivo: EventoDiagnosticoCliente[];
  abierto: boolean;
  alCerrar: () => void;
  alLimpiar: () => void;
}

const ETIQUETA_TIPO: Record<EventoDiagnosticoCliente['tipo'], string> = {
  ronda: 'modelo',
  herramienta: 'base',
  error: 'error',
  turno: 'turno',
};

function hora(iso: string): string {
  return iso.slice(11, 19);
}

function Fila({ evento }: { evento: EventoDiagnosticoCliente }) {
  const [abierto, setAbierto] = useState(evento.tipo === 'error');
  const hayDetalle = evento.detalle !== undefined;

  return (
    <li className={`${estilos.fila} ${evento.tipo === 'error' ? estilos.filaError : ''}`}>
      <button
        type="button"
        className={estilos.cabeceraFila}
        onClick={() => setAbierto((previo) => !previo)}
        disabled={!hayDetalle}
        aria-expanded={hayDetalle ? abierto : undefined}
      >
        <span className={estilos.marcaTiempo}>{hora(evento.ocurridoEn)}</span>
        <span className={`${estilos.tipo} ${estilos[`tipo_${evento.tipo}`] ?? ''}`}>
          {ETIQUETA_TIPO[evento.tipo]}
        </span>
        <span className={estilos.titulo}>{evento.titulo}</span>
        {evento.duracionMs === undefined ? null : (
          <span className={estilos.duracion}>{evento.duracionMs} ms</span>
        )}
        {hayDetalle ? (
          <IconoDesplegar
            tamano={14}
            className={`${estilos.chevron} ${abierto ? estilos.chevronAbierto : ''}`}
          />
        ) : null}
      </button>
      {hayDetalle && abierto ? (
        <pre className={estilos.detalle}>{JSON.stringify(evento.detalle, null, 2)}</pre>
      ) : null}
    </li>
  );
}

/**
 * Cajón técnico para desarrollo: muestra cada ronda contra el modelo, cada
 * consulta a la base y el cuerpo crudo de los errores. Combina los eventos del
 * turno en curso con el registro que guarda el servidor.
 */
export function PanelDiagnostico({ enVivo, abierto, alCerrar, alLimpiar }: Props) {
  const [delServidor, setDelServidor] = useState<EventoDiagnosticoCliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/diagnostico');
      if (!respuesta.ok) {
        setError(`El servidor respondió ${respuesta.status}.`);
        return;
      }
      const datos = (await respuesta.json()) as { eventos?: EventoDiagnosticoCliente[] };
      setDelServidor(datos.eventos ?? []);
    } catch {
      setError('No se pudo leer el registro del servidor.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (abierto) void recargar();
  }, [abierto, recargar]);

  async function limpiar(): Promise<void> {
    await fetch('/api/diagnostico', { method: 'DELETE' }).catch(() => undefined);
    setDelServidor([]);
    alLimpiar();
  }

  if (!abierto) return null;

  const vistos = new Set<string>();
  const eventos = [...enVivo].reverse().concat(delServidor).filter((evento) => {
    if (vistos.has(evento.id)) return false;
    vistos.add(evento.id);
    return true;
  });

  return (
    <aside className={estilos.cajon} aria-label="Registro técnico">
      <header className={estilos.cabecera}>
        <h2 className={estilos.encabezado}>
          <IconoBase tamano={15} />
          Registro técnico
        </h2>
        <span className={estilos.cuenta}>{eventos.length} eventos</span>
        <button type="button" className={estilos.accion} onClick={() => void recargar()} disabled={cargando}>
          {cargando ? 'Leyendo…' : 'Recargar'}
        </button>
        <button type="button" className={estilos.accion} onClick={() => void limpiar()}>
          Vaciar
        </button>
        <button type="button" className={estilos.accion} onClick={alCerrar}>
          Cerrar
        </button>
      </header>

      {error ? (
        <p className={estilos.aviso}>
          <IconoAlerta tamano={15} />
          {error}
        </p>
      ) : null}

      {eventos.length === 0 ? (
        <p className={estilos.vacio}>Todavía no hay eventos. Hacé una pregunta y volvé a mirar.</p>
      ) : (
        <ul className={estilos.lista}>
          {eventos.map((evento) => (
            <Fila evento={evento} key={evento.id} />
          ))}
        </ul>
      )}
    </aside>
  );
}
