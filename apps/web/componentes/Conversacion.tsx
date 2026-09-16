'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BloqueDatos, EventoChat, MensajeChat } from '@/lib/tipos';
import { BloqueDeDatos } from './BloquesDeDatos';
import { MarcaWiBot } from './MarcaWiBot';
import { TextoRico } from './TextoRico';
import { IconoAlerta, IconoBase, IconoDesplegar, IconoDetener, IconoEnviar } from './Iconos';
import estilos from './wibot.module.css';

const SUGERENCIAS = [
  '¿Cómo viene la operación este mes?',
  '¿Qué asesor de Salazar Israel gestionó más cupones en los últimos 30 días?',
  'Comparame los locales por volumen del mes pasado',
  '¿Qué modelos son los que más entran a mantenimiento?',
];

const NOMBRE_HERRAMIENTA: Record<string, string> = {
  resumen_operacion: 'resumen de la operación',
  ranking: 'ranking',
  serie_temporal: 'evolución en el tiempo',
  valores_dimension: 'valores de la dimensión',
  buscar_cliente: 'búsqueda de cliente',
  historial_vehiculo: 'historial del vehículo',
  consulta_sql: 'consulta a medida',
  esquema_cupones: 'esquema de la tabla',
  listar_tablas: 'listado de tablas',
  describir_tabla: 'estructura de la tabla',
};

function horaActual(): string {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

function identificador(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Props {
  nombreBase: string;
  modoPrivacidad: string;
}

/**
 * Conversación completa de WiBot: cabecera, hilo de mensajes y campo de escritura.
 * Consume el flujo NDJSON de /api/chat y va componiendo el turno en curso.
 */
export function Conversacion({ nombreBase, modoPrivacidad }: Props) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [borrador, setBorrador] = useState('');
  const [consultaEnCurso, setConsultaEnCurso] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const hiloRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);
  const abortoRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const hilo = hiloRef.current;
    if (hilo) hilo.scrollTop = hilo.scrollHeight;
  }, [mensajes, consultaEnCurso]);

  const ajustarAltura = useCallback(() => {
    const entrada = entradaRef.current;
    if (!entrada) return;
    entrada.style.height = 'auto';
    entrada.style.height = `${Math.min(entrada.scrollHeight, 140)}px`;
  }, []);

  const detener = useCallback(() => {
    abortoRef.current?.abort();
    abortoRef.current = null;
    setTrabajando(false);
    setConsultaEnCurso(null);
    setMensajes((previos) =>
      previos.map((mensaje) => (mensaje.enCurso ? { ...mensaje, enCurso: false } : mensaje)),
    );
  }, []);

  const enviar = useCallback(
    async (texto: string) => {
      const pregunta = texto.trim();
      if (pregunta === '' || trabajando) return;

      const historial = mensajes.map((mensaje) => ({ autor: mensaje.autor, texto: mensaje.texto }));
      const idRespuesta = identificador();

      setMensajes((previos) => [
        ...previos,
        { id: identificador(), autor: 'persona', texto: pregunta, hora: horaActual(), bloques: [], consultas: [] },
        { id: idRespuesta, autor: 'wibot', texto: '', hora: horaActual(), bloques: [], consultas: [], enCurso: true },
      ]);
      setBorrador('');
      setTrabajando(true);
      window.requestAnimationFrame(ajustarAltura);

      const aborto = new AbortController();
      abortoRef.current = aborto;

      const actualizarRespuesta = (cambio: (mensaje: MensajeChat) => MensajeChat): void => {
        setMensajes((previos) =>
          previos.map((mensaje) => (mensaje.id === idRespuesta ? cambio(mensaje) : mensaje)),
        );
      };

      try {
        const respuesta = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pregunta, historial }),
          signal: aborto.signal,
        });

        if (!respuesta.ok || !respuesta.body) {
          const detalle = (await respuesta.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detalle?.error ?? `El servidor respondió ${respuesta.status}.`);
        }

        const lector = respuesta.body.getReader();
        const decodificador = new TextDecoder();
        let pendiente = '';

        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          pendiente += decodificador.decode(value, { stream: true });
          const lineas = pendiente.split('\n');
          pendiente = lineas.pop() ?? '';

          for (const linea of lineas) {
            if (linea.trim() === '') continue;
            let evento: EventoChat;
            try {
              evento = JSON.parse(linea) as EventoChat;
            } catch {
              continue;
            }

            if (evento.tipo === 'texto') {
              actualizarRespuesta((mensaje) => ({ ...mensaje, texto: mensaje.texto + evento.delta }));
            } else if (evento.tipo === 'consultando') {
              setConsultaEnCurso(NOMBRE_HERRAMIENTA[evento.herramienta] ?? evento.herramienta);
              actualizarRespuesta((mensaje) => ({
                ...mensaje,
                consultas: [...mensaje.consultas, { herramienta: evento.herramienta, argumentos: evento.argumentos }],
              }));
            } else if (evento.tipo === 'datos') {
              const bloque: BloqueDatos = {
                id: identificador(),
                herramienta: evento.herramienta,
                formato: evento.formato,
                resultado: evento.resultado,
              };
              actualizarRespuesta((mensaje) => ({ ...mensaje, bloques: [...mensaje.bloques, bloque] }));
            } else if (evento.tipo === 'error') {
              actualizarRespuesta((mensaje) => ({ ...mensaje, error: evento.mensaje }));
            } else if (evento.tipo === 'fin') {
              setConsultaEnCurso(null);
            }
          }
        }

        actualizarRespuesta((mensaje) => ({ ...mensaje, enCurso: false }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const mensajeError = error instanceof Error ? error.message : 'No se pudo completar la consulta.';
        actualizarRespuesta((mensaje) => ({ ...mensaje, enCurso: false, error: mensajeError }));
      } finally {
        abortoRef.current = null;
        setTrabajando(false);
        setConsultaEnCurso(null);
      }
    },
    [ajustarAltura, mensajes, trabajando],
  );

  const conversacionVacia = mensajes.length === 0;

  return (
    <div className={estilos.aplicacion}>
      <header className={estilos.cabecera}>
        <MarcaWiBot tamano={38} activo={trabajando} />
        <div className={estilos.identidad}>
          <h1 className={estilos.nombre}>
            WiBot
            <span className={`${estilos.estado} ${trabajando ? '' : estilos.estadoInactivo}`}>
              <span className={estilos.punto} />
              {trabajando ? 'CONSULTANDO' : 'LISTO'}
            </span>
          </h1>
          <p className={estilos.bajada}>WIWO · Inteligencia ejecutiva</p>
        </div>
        <p className={estilos.contadorBase} title={`Base ${nombreBase}, privacidad ${modoPrivacidad}`}>
          <IconoBase tamano={14} />
          {nombreBase}
        </p>
      </header>

      <div className={estilos.conversacion} ref={hiloRef}>
        {conversacionVacia ? (
          <div className={estilos.apertura}>
            <h2 className={estilos.aperturaTitulo}>Preguntale a la operación.</h2>
            <p className={estilos.aperturaTexto}>
              87.441 cupones de servicio desde marzo de 2025, con su concesionario, su local, su asesor y su
              vehículo. Escribí en castellano; WiBot consulta la base y te devuelve el número con su período.
            </p>
            <div className={estilos.sugerencias}>
              {SUGERENCIAS.map((sugerencia) => (
                <button
                  type="button"
                  key={sugerencia}
                  className={estilos.sugerencia}
                  onClick={() => void enviar(sugerencia)}
                >
                  {sugerencia}
                  <IconoEnviar tamano={15} className={estilos.sugerenciaFlecha} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mensajes.map((mensaje) =>
          mensaje.autor === 'persona' ? (
            <div className={`${estilos.turno} ${estilos.turnoPersona}`} key={mensaje.id}>
              <div className={`${estilos.burbuja} ${estilos.burbujaPersona}`}>{mensaje.texto}</div>
              <span className={estilos.hora}>{mensaje.hora}</span>
            </div>
          ) : (
            <div className={`${estilos.turno} ${estilos.turnoWibot}`} key={mensaje.id}>
              {mensaje.bloques.map((bloque) => (
                <BloqueDeDatos bloque={bloque} key={bloque.id} />
              ))}

              {mensaje.enCurso && consultaEnCurso ? (
                <div className={estilos.actividad} role="status">
                  <p className={estilos.actividadFila}>
                    <IconoBase tamano={15} />
                    Consultando la base: <span className={estilos.actividadNombre}>{consultaEnCurso}</span>
                  </p>
                  <div className={estilos.barra} />
                </div>
              ) : null}

              {mensaje.texto !== '' || mensaje.enCurso ? (
                <div className={`${estilos.burbuja} ${estilos.burbujaWibot}`}>
                  <TextoRico texto={mensaje.texto} />
                  {mensaje.enCurso ? <span className={estilos.cursor} /> : null}
                </div>
              ) : null}

              {mensaje.error ? (
                <p className={estilos.error}>
                  <IconoAlerta tamano={16} />
                  {mensaje.error}
                </p>
              ) : null}

              {mensaje.consultas.length > 0 && !mensaje.enCurso ? (
                <details className={estilos.consultas}>
                  <summary className={estilos.consultasResumen}>
                    <IconoDesplegar tamano={14} className={estilos.consultasChevron} />
                    {mensaje.consultas.length === 1
                      ? '1 consulta a la base'
                      : `${mensaje.consultas.length} consultas a la base`}
                  </summary>
                  {mensaje.consultas.map((consulta, indice) => (
                    <pre className={estilos.consultaDetalle} key={`${consulta.herramienta}-${indice}`}>
                      {consulta.herramienta}
                      {Object.keys(consulta.argumentos).length > 0
                        ? `\n${JSON.stringify(consulta.argumentos, null, 2)}`
                        : ''}
                    </pre>
                  ))}
                </details>
              ) : null}

              {!mensaje.enCurso ? <span className={estilos.hora}>{mensaje.hora}</span> : null}
            </div>
          ),
        )}
      </div>

      <form
        className={estilos.campo}
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar(borrador);
        }}
      >
        <div className={estilos.campoCaja}>
          <textarea
            ref={entradaRef}
            className={estilos.entrada}
            value={borrador}
            rows={1}
            placeholder="Preguntale a WiBot…"
            aria-label="Escribí tu pregunta"
            onChange={(evento) => {
              setBorrador(evento.target.value);
              ajustarAltura();
            }}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && !evento.shiftKey) {
                evento.preventDefault();
                void enviar(borrador);
              }
            }}
          />
          {trabajando ? (
            <button
              type="button"
              className={`${estilos.enviar} ${estilos.enviarDetener}`}
              onClick={detener}
              aria-label="Detener la consulta"
            >
              <IconoDetener tamano={16} />
            </button>
          ) : (
            <button
              type="submit"
              className={estilos.enviar}
              disabled={borrador.trim() === ''}
              aria-label="Enviar la pregunta"
            >
              <IconoEnviar tamano={18} />
            </button>
          )}
        </div>
        <p className={estilos.aviso}>
          WiBot solo lee la base. Los datos personales se enmascaran salvo en búsquedas puntuales.
        </p>
      </form>
    </div>
  );
}
