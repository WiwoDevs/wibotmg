'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DatosTablero } from '@/lib/tablero';
import { formatearNumero } from '@/lib/formato';
import type { OpcionPeriodo } from '@/lib/periodos';
import { obtenerTextos } from '@/lib/textos';
import { Conversacion } from './Conversacion';
import { Arco, BarraApilada, BarrasHorizontales, SerieDiaria } from './graficos/Graficos';
import { IconoAlerta } from './Iconos';
import { useIdioma } from './ProveedorIdioma';
import { SelectorIdioma } from './SelectorIdioma';
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

/** Tarjeta de un gráfico, con el botón que le pide a WiBot interpretarlo. */
function Tarjeta({ titulo, apoyo, ancha, consulta, alConsultar, children }: PropsTarjeta) {
  const { textos } = useIdioma();
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
          title={textos.tablero.interpretarTitulo}
        >
          {textos.tablero.interpretar}
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
  const { idioma, locale, textos } = useIdioma();
  const t = textos.tablero;
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

    const textosTablero = obtenerTextos(idioma).tablero;
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
          setError(cuerpo.error ?? textosTablero.errorCarga);
          return;
        }
        setDatos(cuerpo);
      })
      .catch(() => {
        if (vigente) setError(textosTablero.errorConexion);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [clavePeriodo, periodos, idioma]);

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
            <h1 className={estilos.titulo}>{t.titulo}</h1>
            <p className={estilos.bajada}>
              {nombreBase} · {etiquetaPeriodo}
            </p>
          </div>

          <div className={estilos.controles}>
            <label className={estilos.selector}>
              <span className={estilos.etiquetaSelector}>{t.periodo}</span>
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
              {chatVisible ? t.ocultarWibot : t.mostrarWibot}
            </button>

            <SelectorIdioma />
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
            {t.faltaGestionAntes} <code>npm run datos:importar</code>
            {t.faltaGestionDespues}
          </p>
        ) : null}

        {cargando && !datos ? <p className={estilos.cargando}>{t.cargando}</p> : null}

        {datos ? (
          <div className={`${estilos.rejilla} ${cargando ? estilos.rejillaCargando : ''}`}>
            <section className={estilos.indicadores}>
              {datos.indicadores.map((indicador) => (
                <article className={estilos.indicador} key={indicador.clave}>
                  <p className={estilos.etiquetaIndicador}>{indicador.etiqueta}</p>
                  <p className={estilos.valorIndicador}>
                    {formatearNumero(indicador.valor, locale)}
                    {indicador.valor !== null && indicador.sufijo ? (
                      <span className={estilos.sufijo}>{indicador.sufijo}</span>
                    ) : null}
                  </p>
                  {indicador.apoyo ? <p className={estilos.apoyoIndicador}>{indicador.apoyo}</p> : null}
                </article>
              ))}
            </section>

            <Tarjeta
              titulo={t.tarjetas.cupones.titulo}
              apoyo={etiquetaPeriodo}
              ancha
              alConsultar={consultar}
              consulta={t.tarjetas.cupones.consulta(datos.periodo)}
            >
              <SerieDiaria puntos={datos.serieCupones} />
            </Tarjeta>

            <Tarjeta
              titulo={t.tarjetas.concesionarios.titulo}
              apoyo={t.tarjetas.concesionarios.apoyo}
              alConsultar={consultar}
              consulta={t.tarjetas.concesionarios.consulta(datos.periodo)}
            >
              <BarrasHorizontales filas={datos.concesionarios} />
            </Tarjeta>

            <Tarjeta
              titulo={t.tarjetas.nps.titulo}
              apoyo={t.tarjetas.nps.apoyo}
              alConsultar={consultar}
              consulta={t.tarjetas.nps.consulta(datos.periodo)}
            >
              <BarrasHorizontales filas={datos.nps} />
            </Tarjeta>

            <Tarjeta
              titulo={t.tarjetas.temperatura.titulo}
              apoyo={t.tarjetas.temperatura.apoyo}
              alConsultar={consultar}
              consulta={t.tarjetas.temperatura.consulta(datos.periodo)}
            >
              <BarraApilada tramos={datos.temperaturaLeads} />
            </Tarjeta>

            <Tarjeta
              titulo={t.tarjetas.puntosDeVenta.titulo}
              apoyo={t.tarjetas.puntosDeVenta.apoyo}
              alConsultar={consultar}
              consulta={t.tarjetas.puntosDeVenta.consulta(datos.periodo)}
            >
              <BarrasHorizontales filas={datos.puntosDeVenta} />
            </Tarjeta>

            <Tarjeta
              titulo={t.tarjetas.telefonia.titulo}
              apoyo={t.tarjetas.telefonia.apoyo(
                formatearNumero(datos.telefonia.atendidas, locale),
                formatearNumero(datos.telefonia.sinAtender, locale),
              )}
              alConsultar={consultar}
              consulta={t.tarjetas.telefonia.consulta(datos.periodo)}
            >
              <Arco
                porcentaje={datos.indicadores.find((i) => i.clave === 'atencion')?.valor ?? null}
                pie={t.tarjetas.telefonia.pie(formatearNumero(datos.telefonia.enEspera, locale))}
              />
            </Tarjeta>

            <Tarjeta
              titulo={t.tarjetas.anexos.titulo}
              apoyo={t.tarjetas.anexos.apoyo}
              alConsultar={consultar}
              consulta={t.tarjetas.anexos.consulta(datos.periodo)}
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
            {t.pestanaTablero}
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
