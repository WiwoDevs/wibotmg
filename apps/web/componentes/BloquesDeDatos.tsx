'use client';

import type { BloqueDatos } from '@/lib/tipos';
import type { Textos } from '@/lib/textos';
import {
  esColumnaTecnica,
  esValorNumerico,
  etiquetarColumna,
  formatearDecimal,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
  formatearRangoFechas,
} from '@/lib/formato';
import { useIdioma } from './ProveedorIdioma';
import { IconoPrivacidad } from './Iconos';
import estilos from './conversacion.module.css';

interface Periodo {
  desde: string;
  hasta: string;
  etiqueta: string;
}

interface ResumenOperacion {
  periodo: Periodo;
  cupones: number;
  concesionarios: number;
  locales: number;
  asesores: number;
  clientes: number;
  vehiculos: number;
  kilometrajePromedio: number | null;
  porTipoDocumento: Array<{ tipoDocumento: string; cupones: number }>;
}

interface Ranking {
  periodo: Periodo;
  dimension: string;
  total: number;
  filas: Array<{ etiqueta: string; cupones: number; clientes: number; participacion: number }>;
}

interface AnalisisEncuestas {
  periodo: Periodo;
  eje: string;
  filas: Array<{
    etiqueta: string;
    respuestas: number;
    satisfaccion: number | null;
    recomendacion: number | null;
    nps: number | null;
    promotores: number;
    detractores: number;
    porcentajeCumplioFecha: number | null;
  }>;
}

interface AnalisisLeads {
  periodo: Periodo;
  eje: string;
  total: number;
  filas: Array<{
    etiqueta: string;
    leads: number;
    superCalientes: number;
    calientes: number;
    tibios: number;
    frios: number;
    convertidos: number;
    porcentajeConversion: number | null;
  }>;
}

interface AnalisisLlamadas {
  periodo: Periodo;
  eje: string;
  filas: Array<{
    etiqueta: string;
    llamadas: number;
    atendidas: number;
    sinAtender: number;
    porcentajeAtencion: number | null;
    minutosHablados: number;
  }>;
}

interface SerieTemporal {
  periodo: Periodo;
  granularidad: string;
  puntos: Array<{ intervalo: string; cupones: number }>;
}

type TextosBloques = Textos['bloques'];

/**
 * Busca la traducción de una clave interna en un diccionario de textos.
 *
 * @param diccionario traducciones del idioma actual.
 * @param clave clave interna, tal como la devuelve el núcleo.
 * @param respaldo texto a mostrar si la clave no tiene traducción.
 */
function traducir(diccionario: Record<string, string>, clave: string, respaldo: string): string {
  return diccionario[clave] ?? respaldo;
}

/**
 * Etiqueta visible de una columna: la traducción conocida o, si no la hay,
 * el nombre de la columna vuelto legible.
 */
function etiquetaDeColumna(columna: string, textos: TextosBloques): string {
  return textos.columnas[columna.toLowerCase()] ?? etiquetarColumna(columna);
}

/**
 * Traduce los valores que llegan en español con una traducción fija
 * (temperaturas de lead, "sin dato", booleanos). El resto se devuelve igual.
 */
function traducirValor(valor: unknown, textos: TextosBloques): string {
  if (typeof valor === 'boolean') return valor ? textos.si : textos.no;
  const texto = String(valor);
  return textos.valores[texto] ?? texto;
}

/**
 * Rotula el período con las fechas en el idioma actual. Si las fechas no se
 * reconocen se muestra la etiqueta que armó el núcleo.
 */
function etiquetaDePeriodo(periodo: Periodo, locale: string): string {
  return formatearRangoFechas(periodo.desde, periodo.hasta, locale) ?? periodo.etiqueta;
}

function Encabezado({ titulo, periodo }: { titulo: string; periodo?: Periodo }) {
  const { locale } = useIdioma();
  return (
    <div className={estilos.bloqueEncabezado}>
      <h3 className={estilos.bloqueTitulo}>{titulo}</h3>
      {periodo ? <span className={estilos.bloquePeriodo}>{etiquetaDePeriodo(periodo, locale)}</span> : null}
    </div>
  );
}

function PieEnmascarado({ columnas }: { columnas: string[] }) {
  const { textos } = useIdioma();
  if (columnas.length === 0) return null;
  const nombres = columnas.map((columna) => etiquetaDeColumna(columna, textos.bloques)).join(', ');
  return (
    <p className={estilos.pieBloque}>
      <IconoPrivacidad tamano={14} />
      {textos.bloques.datosEnmascarados} {nombres}
    </p>
  );
}

function VistaResumen({ datos }: { datos: ResumenOperacion }) {
  const { locale, textos } = useIdioma();
  const t = textos.bloques.resumen;
  const lecturas: Array<[string, string]> = [
    [t.localesActivos, formatearNumero(datos.locales, locale)],
    [t.asesores, formatearNumero(datos.asesores, locale)],
    [t.clientesDistintos, formatearNumero(datos.clientes, locale)],
    [t.vehiculos, formatearNumero(datos.vehiculos, locale)],
    [t.concesionarios, formatearNumero(datos.concesionarios, locale)],
  ];

  // El kilometraje lleva unidad y no entra en media fila junto a su etiqueta.
  const kilometraje =
    datos.kilometrajePromedio === null
      ? '—'
      : `${formatearNumero(datos.kilometrajePromedio, locale)} ${t.unidadKm}`;

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={textos.bloques.titulos.operacion} periodo={datos.periodo} />
      <div className={estilos.lecturas}>
        <div className={`${estilos.lectura} ${estilos.lecturaPrincipal}`}>
          <span className={estilos.lecturaEtiqueta}>{t.cuponesEmitidos}</span>
          <span className={estilos.lecturaValor}>{formatearNumero(datos.cupones, locale)}</span>
        </div>
        {lecturas.map(([etiqueta, valor]) => (
          <div className={estilos.lectura} key={etiqueta}>
            <span className={estilos.lecturaEtiqueta}>{etiqueta}</span>
            <span className={estilos.lecturaValor}>{valor}</span>
          </div>
        ))}
        <div className={`${estilos.lectura} ${estilos.lecturaAncha}`}>
          <span className={estilos.lecturaEtiqueta}>{t.kilometrajePromedio}</span>
          <span className={estilos.lecturaValor}>{kilometraje}</span>
        </div>
      </div>
      {datos.porTipoDocumento.length > 0 ? (
        <div className={estilos.filas}>
          {datos.porTipoDocumento.slice(0, 6).map((fila) => (
            <div className={`${estilos.fila} ${estilos.filaSimple}`} key={fila.tipoDocumento}>
              <span className={estilos.etiquetaFila}>{traducirValor(fila.tipoDocumento, textos.bloques)}</span>
              <span className={estilos.cifraFila}>{formatearNumero(fila.cupones, locale)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function VistaRanking({ datos }: { datos: Ranking }) {
  const { locale, textos } = useIdioma();
  const maximo = datos.filas.reduce((tope, fila) => Math.max(tope, fila.cupones), 0);
  const titulo = traducir(textos.bloques.dimensiones, datos.dimension, textos.bloques.titulos.ranking);

  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>{textos.bloques.vacios.registros}</p>
      </section>
    );
  }

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={titulo} periodo={datos.periodo} />
      <div className={estilos.filas}>
        {datos.filas.map((fila, indice) => (
          <div className={estilos.fila} key={`${fila.etiqueta}-${indice}`}>
            <span className={estilos.posicion}>{String(indice + 1).padStart(2, '0')}</span>
            <span className={estilos.etiquetaFila} title={fila.etiqueta}>
              {traducirValor(fila.etiqueta, textos.bloques)}
            </span>
            <span className={estilos.cifraFila}>
              {formatearNumero(fila.cupones, locale)}
              <span style={{ color: 'var(--texto-suave)' }}> · {formatearPorcentaje(fila.participacion, locale)}</span>
            </span>
            <div className={estilos.medidor}>
              <div
                className={estilos.medidorRelleno}
                style={{ width: `${maximo === 0 ? 0 : (fila.cupones / maximo) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function VistaSerie({ datos }: { datos: SerieTemporal }) {
  const { locale, textos } = useIdioma();
  const t = textos.bloques;
  const puntos = datos.puntos;
  if (puntos.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={t.titulos.evolucion} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>{textos.bloques.vacios.registros}</p>
      </section>
    );
  }

  const maximo = puntos.reduce((tope, punto) => Math.max(tope, punto.cupones), 0) || 1;
  const anchoPaso = 100 / puntos.length;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  return (
    <section className={estilos.bloque}>
      <Encabezado
        titulo={t.titulos.evolucionPor(traducir(t.granularidades, datos.granularidad, datos.granularidad))}
        periodo={datos.periodo}
      />
      <div className={estilos.serie}>
        <svg
          className={estilos.serieGrafico}
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          role="img"
          aria-label={t.serie.descripcion(puntos.length, formatearNumero(maximo, locale))}
        >
          {puntos.map((punto, indice) => {
            const alto = (punto.cupones / maximo) * 38;
            return (
              <rect
                key={punto.intervalo}
                className={estilos.serieBarra}
                x={indice * anchoPaso + anchoPaso * 0.18}
                y={40 - alto}
                width={anchoPaso * 0.64}
                height={Math.max(alto, 0.6)}
                rx={0.4}
              >
                <title>{t.serie.barra(formatearFecha(punto.intervalo, locale), formatearNumero(punto.cupones, locale))}</title>
              </rect>
            );
          })}
        </svg>
        <div className={estilos.serieEje}>
          <span>{primero ? formatearFecha(primero.intervalo, locale) : ''}</span>
          <span>{t.serie.maximo(formatearNumero(maximo, locale))}</span>
          <span>{ultimo ? formatearFecha(ultimo.intervalo, locale) : ''}</span>
        </div>
      </div>
    </section>
  );
}

/** Extrae el arreglo de filas de los distintos resultados con forma de tabla. */
function extraerFilas(resultado: unknown): { filas: Array<Record<string, unknown>>; enmascaradas: string[] } {
  if (Array.isArray(resultado)) {
    return { filas: resultado as Array<Record<string, unknown>>, enmascaradas: [] };
  }
  if (typeof resultado === 'object' && resultado !== null) {
    const objeto = resultado as Record<string, unknown>;
    const enmascaradas = Array.isArray(objeto.columnasEnmascaradas)
      ? (objeto.columnasEnmascaradas as string[])
      : [];
    for (const clave of ['filas', 'clientes', 'atenciones', 'leads', 'llamadas']) {
      if (Array.isArray(objeto[clave])) {
        return { filas: objeto[clave] as Array<Record<string, unknown>>, enmascaradas };
      }
    }
  }
  return { filas: [], enmascaradas: [] };
}

function VistaTabla({ titulo, resultado }: { titulo: string; resultado: unknown }) {
  const { locale, textos } = useIdioma();
  const { filas, enmascaradas } = extraerFilas(resultado);

  if (filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} />
        <p className={estilos.actividadFila}>{textos.bloques.vacios.filas}</p>
      </section>
    );
  }

  const primera = filas[0] ?? {};
  const columnas = Object.keys(primera).slice(0, 8);

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={titulo} />
      <div className={estilos.envoltorioTabla}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              {columnas.map((columna) => (
                <th key={columna} scope="col">
                  {etiquetaDeColumna(columna, textos.bloques)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 25).map((fila, indice) => (
              <tr key={indice}>
                {columnas.map((columna) => {
                  const valor = fila[columna];
                  const numerico = esValorNumerico(valor);
                  const clase = numerico
                    ? estilos.celdaNumerica
                    : esColumnaTecnica(columna)
                      ? estilos.celdaTecnica
                      : undefined;
                  const texto =
                    valor === null || valor === undefined || valor === ''
                      ? '—'
                      : numerico
                        ? formatearNumero(valor, locale)
                        : traducirValor(valor, textos.bloques);
                  return (
                    <td key={columna} className={clase} title={texto}>
                      {texto}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PieEnmascarado columnas={enmascaradas} />
    </section>
  );
}

/** Colorea el NPS según el rango en que cae. */
function claseNps(nps: number | null): string {
  if (nps === null) return '';
  if (nps >= 50) return estilos.npsBueno ?? '';
  if (nps >= 0) return estilos.npsMedio ?? '';
  return estilos.npsMalo ?? '';
}

function VistaEncuestas({ datos }: { datos: AnalisisEncuestas }) {
  const { locale, textos } = useIdioma();
  const t = textos.bloques.encuestas;
  const titulo = traducir(textos.bloques.ejesEncuestas, datos.eje, textos.bloques.titulos.encuestas);

  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>{textos.bloques.vacios.respuestas}</p>
      </section>
    );
  }

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={titulo} periodo={datos.periodo} />
      <div className={estilos.envoltorioTabla}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">{datos.eje === 'mes' ? t.mes : t.nombre}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.respuestas}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.nps}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.satisfaccion}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.recomendacion}</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => (
              <tr key={fila.etiqueta}>
                <td title={fila.etiqueta}>{traducirValor(fila.etiqueta, textos.bloques)}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.respuestas, locale)}</td>
                <td className={`${estilos.celdaNumerica} ${claseNps(fila.nps)}`}>
                  {formatearDecimal(fila.nps, 0, locale)}
                </td>
                <td className={estilos.celdaNumerica}>{formatearDecimal(fila.satisfaccion, 2, locale)}</td>
                <td className={estilos.celdaNumerica}>{formatearDecimal(fila.recomendacion, 2, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={estilos.notaBloque}>{t.nota}</p>
    </section>
  );
}

/** Tramos de temperatura, del más caliente al más frío; la etiqueta sale de los textos. */
const TEMPERATURAS: Array<{
  clave: keyof TextosBloques['temperaturas'];
  clase: string;
}> = [
  { clave: 'superCalientes', clase: estilos.calor4 ?? '' },
  { clave: 'calientes', clase: estilos.calor3 ?? '' },
  { clave: 'tibios', clase: estilos.calor2 ?? '' },
  { clave: 'frios', clase: estilos.calor1 ?? '' },
];

function VistaLeads({ datos }: { datos: AnalisisLeads }) {
  const { locale, textos } = useIdioma();
  const temperaturas = textos.bloques.temperaturas;
  const titulo = traducir(textos.bloques.ejesLeads, datos.eje, textos.bloques.titulos.leads);
  const maximo = datos.filas.reduce((tope, fila) => Math.max(tope, fila.leads), 0);

  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>{textos.bloques.vacios.leads}</p>
      </section>
    );
  }

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={titulo} periodo={datos.periodo} />
      <div className={estilos.filas}>
        {datos.filas.map((fila) => (
          <div className={`${estilos.fila} ${estilos.filaSimple}`} key={fila.etiqueta}>
            <span className={estilos.etiquetaFila} title={fila.etiqueta}>
              {traducirValor(fila.etiqueta, textos.bloques)}
            </span>
            <span className={estilos.cifraFila}>{formatearNumero(fila.leads, locale)}</span>
            <div
              className={`${estilos.medidor} ${estilos.medidorLeads}`}
              style={{ width: `${maximo === 0 ? 0 : (fila.leads / maximo) * 100}%` }}
            >
              {TEMPERATURAS.map(({ clave, clase }) => {
                const valor = fila[clave];
                if (valor === 0) return null;
                return (
                  <span
                    key={clave}
                    className={`${estilos.tramo} ${clase}`}
                    style={{ width: `${(valor / fila.leads) * 100}%` }}
                    title={`${temperaturas[clave]}: ${formatearNumero(valor, locale)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className={estilos.notaBloque}>
        {TEMPERATURAS.map(({ clave, clase }) => (
          <span className={estilos.leyenda} key={clave}>
            <span className={`${estilos.puntoLeyenda} ${clase}`} />
            {temperaturas[clave]}
          </span>
        ))}
      </p>
    </section>
  );
}

function VistaLlamadas({ datos }: { datos: AnalisisLlamadas }) {
  const { locale, textos } = useIdioma();
  const t = textos.bloques.llamadas;
  const titulo = textos.bloques.titulos.telefonia;
  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>{textos.bloques.vacios.llamadas}</p>
      </section>
    );
  }

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={titulo} periodo={datos.periodo} />
      <div className={estilos.envoltorioTabla}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">{t.grupo}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.llamadas}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.atendidas}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.atencion}</th>
              <th scope="col" className={estilos.celdaNumerica}>{t.minutos}</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => (
              <tr key={fila.etiqueta}>
                <td title={fila.etiqueta}>{traducirValor(fila.etiqueta, textos.bloques)}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.llamadas, locale)}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.atendidas, locale)}</td>
                <td className={estilos.celdaNumerica}>{formatearPorcentaje(fila.porcentajeAtencion, locale)}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.minutosHablados, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Renderiza un bloque de datos según el formato que declaró la herramienta.
 * Si el resultado no encaja con la forma esperada, cae en la vista de tabla.
 */
export function BloqueDeDatos({ bloque }: { bloque: BloqueDatos }) {
  const { textos } = useIdioma();
  const titulo = traducir(textos.bloques.herramientas, bloque.herramienta, textos.bloques.titulos.resultado);

  if (bloque.formato === 'resumen' && typeof bloque.resultado === 'object' && bloque.resultado !== null) {
    return <VistaResumen datos={bloque.resultado as ResumenOperacion} />;
  }
  if (bloque.formato === 'ranking' && typeof bloque.resultado === 'object' && bloque.resultado !== null) {
    return <VistaRanking datos={bloque.resultado as Ranking} />;
  }
  if (bloque.formato === 'serie' && typeof bloque.resultado === 'object' && bloque.resultado !== null) {
    return <VistaSerie datos={bloque.resultado as SerieTemporal} />;
  }
  if (bloque.formato === 'encuestas' && typeof bloque.resultado === 'object' && bloque.resultado !== null) {
    return <VistaEncuestas datos={bloque.resultado as AnalisisEncuestas} />;
  }
  if (bloque.formato === 'leads' && typeof bloque.resultado === 'object' && bloque.resultado !== null) {
    return <VistaLeads datos={bloque.resultado as AnalisisLeads} />;
  }
  if (bloque.formato === 'llamadas' && typeof bloque.resultado === 'object' && bloque.resultado !== null) {
    return <VistaLlamadas datos={bloque.resultado as AnalisisLlamadas} />;
  }
  if (bloque.formato === 'texto') return null;

  return <VistaTabla titulo={titulo} resultado={bloque.resultado} />;
}
