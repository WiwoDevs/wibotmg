'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DatosTablero } from '@/lib/tablero';
import type { OpcionPeriodo } from '@/lib/periodos';
import { Conversacion } from './Conversacion';
import { Arco, BarraApilada, BarrasHorizontales, SerieDiaria } from './graficos/Graficos';
import { IconoAlerta } from './Iconos';
import estilos from './tablero.module.css';

interface Props {
  periodos: OpcionPeriodo[];
  periodoInicial: string;
  nombreBase: string;
  modoPrivacidad: string;
  usuario: { nombre: string; correo: string };
  modoDiagnostico: boolean;
}

const CLAVE_CHAT = 'wibot.tablero.chat';

function numero(valor: number | null): string {
  if (valor === null) return '—';
  return new Intl.NumberFormat('es-CL').format(valor);
}

/**
 * Lee del navegador si el chat quedó abierto la última vez.
 * El almacenamiento puede fallar en ventanas privadas, así que se asume abierto.
 */
function leerPreferenciaChat(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_CHAT) !== 'oculto';
  } catch {
    return true;
  }
}

interface PropsTarjeta {
  titulo: string;
  apoyo?: string;
  ancha?: boolean;
  /** Pregunta que se le manda a WiBot sobre esta tarjeta. */
  consulta: string;
  alConsultar: (pregunta: string) => void;
  children: React.ReactNode;
}

function Tarjeta({ titulo, apoyo, ancha, consulta, alConsultar, children }: PropsTarjeta) {
  return (
    <section className={`${estilos.tarjeta} ${ancha ? estilos.tarjetaAncha : ''}`}>
      <header className={estilos.cabeceraTarjeta}>
        <div>
          <h2 className={estilos.tituloTarjeta}>{titulo}</h2>
          {apoyo ? <p className={estilos.apoyoTarjeta}>{apoyo}</p> : null}
        </div>
        <button
          type="button"
          className={estilos.botonConsultar}
          onClick={() => alConsultar(consulta)}
          title="Pedirle a WiBot que lo interprete"
        >
          Interpretar
        </button>
      </header>
      {children}
    </section>
  );
}

/**
 * Tablero ejecutivo: las cuatro fuentes en una pantalla, con WiBot al lado para
 * interpretar cualquiera de los gráficos.
 */
export function Tablero({
  periodos,
  periodoInicial,
  nombreBase,
  modoPrivacidad,
  usuario,
  modoDiagnostico,
}: Props) {
  const [clavePeriodo, setClavePeriodo] = useState(periodoInicial);
  const [datos, setDatos] = useState<DatosTablero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(true);
  const [vistaMovil, setVistaMovil] = useState<'tablero' | 'chat'>('tablero');
  const [preguntaParaChat, setPreguntaParaChat] = useState<string>('');

  useEffect(() => {
    setChatVisible(leerPreferenciaChat());
  }, []);

  useEffect(() => {
    const periodo = periodos.find((opcion) => opcion.clave === clavePeriodo) ?? periodos[0];
    if (!periodo) return;

    let vigente = true;
    setCargando(true);
    setError(null);

    fetch(`/api/tablero?desde=${periodo.desde}&hasta=${periodo.hasta}`)
      .then(async (respuesta) => {
        if (respuesta.status === 401) {
          window.location.href = '/entrar';
          return;
        }
        const cuerpo = (await respuesta.json()) as DatosTablero & { error?: string };
        if (!vigente) return;
        if (!respuesta.ok) {
          setError(cuerpo.error ?? 'No se pudo cargar el tablero.');
          return;
        }
        setDatos(cuerpo);
      })
      .catch(() => {
        if (vigente) setError('No se pudo contactar al servidor.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [clavePeriodo, periodos]);

  const alternarChat = useCallback((): void => {
    setChatVisible((previo) => {
      const siguiente = !previo;
      try {
        window.localStorage.setItem(CLAVE_CHAT, siguiente ? 'visible' : 'oculto');
      } catch {
        // Sin almacenamiento la preferencia dura lo que dure la pestaña.
      }
      return siguiente;
    });
  }, []);

  const consultar = useCallback((pregunta: string): void => {
    setPreguntaParaChat(pregunta);
    setChatVisible(true);
    setVistaMovil('chat');
  }, []);

  const periodo = periodos.find((opcion) => opcion.clave === clavePeriodo) ?? periodos[0];
  const etiquetaPeriodo = periodo?.etiqueta ?? '';

  return (
    <div className={`${estilos.pagina} ${chatVisible ? estilos.conChat : ''}`}>
      <div className={`${estilos.columnaTablero} ${vistaMovil === 'chat' ? estilos.ocultoEnMovil : ''}`}>
        <header className={estilos.cabecera}>
          <div className={estilos.identidad}>
            <h1 className={estilos.titulo}>Tablero</h1>
            <p className={estilos.bajada}>
              {nombreBase} · {etiquetaPeriodo}
            </p>
          </div>

          <div className={estilos.controles}>
            <label className={estilos.selector}>
              <span className={estilos.etiquetaSelector}>Período</span>
              <select
                className={estilos.select}
                value={clavePeriodo}
                onChange={(evento) => setClavePeriodo(evento.target.value)}
              >
                {periodos.map((opcion) => (
                  <option value={opcion.clave} key={opcion.clave}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={`${estilos.interruptor} ${chatVisible ? estilos.interruptorActivo : ''}`}
              onClick={alternarChat}
              aria-pressed={chatVisible}
            >
              {chatVisible ? 'Ocultar WiBot' : 'Mostrar WiBot'}
            </button>
          </div>
        </header>

        {error ? (
          <p className={estilos.error} role="alert">
            <IconoAlerta tamano={16} />
            {error}
          </p>
        ) : null}

        {!error && datos && !datos.hayGestion ? (
          <p className={estilos.aviso}>
            <IconoAlerta tamano={16} />
            Falta importar encuestas, leads y telefonía. Corré <code>npm run datos:importar</code>.
          </p>
        ) : null}

        {cargando && !datos ? <p className={estilos.cargando}>Consultando la operación…</p> : null}

        {datos ? (
          <div className={`${estilos.rejilla} ${cargando ? estilos.rejillaCargando : ''}`}>
            <section className={estilos.indicadores}>
              {datos.indicadores.map((indicador) => (
                <article className={estilos.indicador} key={indicador.clave}>
                  <p className={estilos.etiquetaIndicador}>{indicador.etiqueta}</p>
                  <p className={estilos.valorIndicador}>
                    {numero(indicador.valor)}
                    {indicador.valor !== null && indicador.sufijo ? (
                      <span className={estilos.sufijo}>{indicador.sufijo}</span>
                    ) : null}
                  </p>
                  {indicador.apoyo ? <p className={estilos.apoyoIndicador}>{indicador.apoyo}</p> : null}
                </article>
              ))}
            </section>

            <Tarjeta
              titulo="Cupones día a día"
              apoyo={etiquetaPeriodo}
              ancha
              alConsultar={consultar}
              consulta={`Mirá la evolución diaria de cupones entre ${datos.periodo.desde} y ${datos.periodo.hasta}: explicame el patrón, dónde están los picos y las caídas, y qué puede estar detrás.`}
            >
              <SerieDiaria puntos={datos.serieCupones} />
            </Tarjeta>

            <Tarjeta
              titulo="Concesionarios por volumen"
              apoyo="cupones emitidos"
              alConsultar={consultar}
              consulta={`Analizá el ranking de concesionarios por cupones entre ${datos.periodo.desde} y ${datos.periodo.hasta}: quién lidera, qué tan concentrado está y qué concesionario se quedó atrás.`}
            >
              <BarrasHorizontales filas={datos.concesionarios} />
            </Tarjeta>

            <Tarjeta
              titulo="NPS por concesionario"
              apoyo="solo con 20 respuestas o más"
              alConsultar={consultar}
              consulta={`Interpretá el NPS por concesionario entre ${datos.periodo.desde} y ${datos.periodo.hasta}, considerando solo los que tengan 20 respuestas o más: quién está bien, quién preocupa y qué haría falta revisar.`}
            >
              <BarrasHorizontales filas={datos.nps} />
            </Tarjeta>

            <Tarjeta
              titulo="Temperatura de los leads"
              apoyo="reparto del total"
              alConsultar={consultar}
              consulta={`Interpretá el reparto de leads por temperatura entre ${datos.periodo.desde} y ${datos.periodo.hasta}: qué dice de la calidad de la demanda y qué habría que hacer con los súper calientes.`}
            >
              <BarraApilada tramos={datos.temperaturaLeads} />
            </Tarjeta>

            <Tarjeta
              titulo="Puntos de venta"
              apoyo="leads recibidos"
              alConsultar={consultar}
              consulta={`Analizá los puntos de venta por leads recibidos entre ${datos.periodo.desde} y ${datos.periodo.hasta}, prestando atención a cuántos son súper calientes en cada uno.`}
            >
              <BarrasHorizontales filas={datos.puntosDeVenta} />
            </Tarjeta>

            <Tarjeta
              titulo="Atención telefónica"
              apoyo={`${numero(datos.telefonia.atendidas)} atendidas · ${numero(datos.telefonia.sinAtender)} perdidas`}
              alConsultar={consultar}
              consulta={`Interpretá la tasa de atención telefónica entre ${datos.periodo.desde} y ${datos.periodo.hasta}: ¿es buena o mala para un contact center de posventa, y qué está pasando con las llamadas perdidas?`}
            >
              <Arco
                porcentaje={datos.indicadores.find((i) => i.clave === 'atencion')?.valor ?? null}
                pie={`${numero(datos.telefonia.enEspera)} quedaron en espera`}
              />
            </Tarjeta>

            <Tarjeta
              titulo="Anexos que más pierden"
              apoyo="llamadas sin atender"
              alConsultar={consultar}
              consulta={`Analizá los anexos telefónicos con más llamadas perdidas entre ${datos.periodo.desde} y ${datos.periodo.hasta}: qué anexo preocupa más y qué recomendarías.`}
            >
              <BarrasHorizontales filas={datos.anexos} />
            </Tarjeta>
          </div>
        ) : null}
      </div>

      {chatVisible ? (
        <aside className={`${estilos.columnaChat} ${vistaMovil === 'tablero' ? estilos.ocultoEnMovil : ''}`}>
          <Conversacion
            nombreBase={nombreBase}
            modoPrivacidad={modoPrivacidad}
            usuario={usuario}
            modoDiagnostico={modoDiagnostico}
            preguntaInicial={preguntaParaChat}
          />
        </aside>
      ) : null}

      {chatVisible ? (
        <nav className={estilos.pestanasMovil}>
          <button
            type="button"
            className={vistaMovil === 'tablero' ? estilos.pestanaActiva : estilos.pestana}
            onClick={() => setVistaMovil('tablero')}
          >
            Tablero
          </button>
          <button
            type="button"
            className={vistaMovil === 'chat' ? estilos.pestanaActiva : estilos.pestana}
            onClick={() => setVistaMovil('chat')}
          >
            WiBot
          </button>
        </nav>
      ) : null}
    </div>
  );
}
