import type { BloqueDatos } from '@/lib/tipos';
import {
  esColumnaTecnica,
  esValorNumerico,
  etiquetarColumna,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from '@/lib/formato';
import { IconoPrivacidad } from './Iconos';
import estilos from './wibot.module.css';

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

const TITULO_DIMENSION: Record<string, string> = {
  concesionario: 'Concesionarios',
  local: 'Locales',
  asesor: 'Asesores',
  tipoDocumento: 'Tipos de documento',
  familia: 'Familias',
  modelo: 'Modelos',
  region: 'Regiones',
  comuna: 'Comunas',
};

function Encabezado({ titulo, periodo }: { titulo: string; periodo?: Periodo }) {
  return (
    <div className={estilos.bloqueEncabezado}>
      <h3 className={estilos.bloqueTitulo}>{titulo}</h3>
      {periodo ? <span className={estilos.bloquePeriodo}>{periodo.etiqueta}</span> : null}
    </div>
  );
}

function PieEnmascarado({ columnas }: { columnas: string[] }) {
  if (columnas.length === 0) return null;
  return (
    <p className={estilos.pieBloque}>
      <IconoPrivacidad tamano={14} />
      Datos personales enmascarados: {columnas.map(etiquetarColumna).join(', ').toLowerCase()}
    </p>
  );
}

function VistaResumen({ datos }: { datos: ResumenOperacion }) {
  const lecturas: Array<[string, string]> = [
    ['Locales activos', formatearNumero(datos.locales)],
    ['Asesores', formatearNumero(datos.asesores)],
    ['Clientes distintos', formatearNumero(datos.clientes)],
    ['Vehículos', formatearNumero(datos.vehiculos)],
    ['Concesionarios', formatearNumero(datos.concesionarios)],
  ];

  // El kilometraje lleva unidad y no entra en media fila junto a su etiqueta.
  const kilometraje =
    datos.kilometrajePromedio === null ? '—' : `${formatearNumero(datos.kilometrajePromedio)} km`;

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo="Operación" periodo={datos.periodo} />
      <div className={estilos.lecturas}>
        <div className={`${estilos.lectura} ${estilos.lecturaPrincipal}`}>
          <span className={estilos.lecturaEtiqueta}>Cupones emitidos</span>
          <span className={estilos.lecturaValor}>{formatearNumero(datos.cupones)}</span>
        </div>
        {lecturas.map(([etiqueta, valor]) => (
          <div className={estilos.lectura} key={etiqueta}>
            <span className={estilos.lecturaEtiqueta}>{etiqueta}</span>
            <span className={estilos.lecturaValor}>{valor}</span>
          </div>
        ))}
        <div className={`${estilos.lectura} ${estilos.lecturaAncha}`}>
          <span className={estilos.lecturaEtiqueta}>Kilometraje promedio</span>
          <span className={estilos.lecturaValor}>{kilometraje}</span>
        </div>
      </div>
      {datos.porTipoDocumento.length > 0 ? (
        <div className={estilos.filas}>
          {datos.porTipoDocumento.slice(0, 6).map((fila) => (
            <div className={`${estilos.fila} ${estilos.filaSimple}`} key={fila.tipoDocumento}>
              <span className={estilos.etiquetaFila}>{fila.tipoDocumento}</span>
              <span className={estilos.cifraFila}>{formatearNumero(fila.cupones)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function VistaRanking({ datos }: { datos: Ranking }) {
  const maximo = datos.filas.reduce((tope, fila) => Math.max(tope, fila.cupones), 0);
  const titulo = TITULO_DIMENSION[datos.dimension] ?? 'Ranking';

  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>No hay registros en este período.</p>
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
              {fila.etiqueta}
            </span>
            <span className={estilos.cifraFila}>
              {formatearNumero(fila.cupones)}
              <span style={{ color: 'var(--texto-suave)' }}> · {formatearPorcentaje(fila.participacion)}</span>
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
  const puntos = datos.puntos;
  if (puntos.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo="Evolución" periodo={datos.periodo} />
        <p className={estilos.actividadFila}>No hay registros en este período.</p>
      </section>
    );
  }

  const maximo = puntos.reduce((tope, punto) => Math.max(tope, punto.cupones), 0) || 1;
  const anchoPaso = 100 / puntos.length;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo={`Evolución por ${datos.granularidad}`} periodo={datos.periodo} />
      <div className={estilos.serie}>
        <svg
          className={estilos.serieGrafico}
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Serie de ${puntos.length} intervalos, máximo ${maximo} cupones`}
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
                <title>{`${punto.intervalo}: ${formatearNumero(punto.cupones)} cupones`}</title>
              </rect>
            );
          })}
        </svg>
        <div className={estilos.serieEje}>
          <span>{primero ? formatearFecha(primero.intervalo) : ''}</span>
          <span>máx. {formatearNumero(maximo)}</span>
          <span>{ultimo ? formatearFecha(ultimo.intervalo) : ''}</span>
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
    for (const clave of ['filas', 'clientes', 'atenciones']) {
      if (Array.isArray(objeto[clave])) {
        return { filas: objeto[clave] as Array<Record<string, unknown>>, enmascaradas };
      }
    }
  }
  return { filas: [], enmascaradas: [] };
}

function VistaTabla({ titulo, resultado }: { titulo: string; resultado: unknown }) {
  const { filas, enmascaradas } = extraerFilas(resultado);

  if (filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} />
        <p className={estilos.actividadFila}>La consulta no devolvió filas.</p>
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
                  {etiquetarColumna(columna)}
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
                        ? formatearNumero(valor)
                        : String(valor);
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

const TITULO_EJE_ENCUESTAS: Record<string, string> = {
  concesionario: 'Satisfacción por concesionario',
  sucursal: 'Satisfacción por sucursal',
  mes: 'Satisfacción por mes',
  total: 'Satisfacción general',
};

/** Colorea el NPS según el rango en que cae. */
function claseNps(nps: number | null): string {
  if (nps === null) return '';
  if (nps >= 50) return estilos.npsBueno ?? '';
  if (nps >= 0) return estilos.npsMedio ?? '';
  return estilos.npsMalo ?? '';
}

function VistaEncuestas({ datos }: { datos: AnalisisEncuestas }) {
  const titulo = TITULO_EJE_ENCUESTAS[datos.eje] ?? 'Encuestas de posventa';

  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>No hay respuestas en este período.</p>
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
              <th scope="col">{datos.eje === 'mes' ? 'Mes' : 'Nombre'}</th>
              <th scope="col" className={estilos.celdaNumerica}>Respuestas</th>
              <th scope="col" className={estilos.celdaNumerica}>NPS</th>
              <th scope="col" className={estilos.celdaNumerica}>Satisfacción</th>
              <th scope="col" className={estilos.celdaNumerica}>Recomendación</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => (
              <tr key={fila.etiqueta}>
                <td title={fila.etiqueta}>{fila.etiqueta}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.respuestas)}</td>
                <td className={`${estilos.celdaNumerica} ${claseNps(fila.nps)}`}>
                  {fila.nps === null ? '—' : fila.nps.toFixed(0)}
                </td>
                <td className={estilos.celdaNumerica}>
                  {fila.satisfaccion === null ? '—' : fila.satisfaccion.toFixed(2).replace('.', ',')}
                </td>
                <td className={estilos.celdaNumerica}>
                  {fila.recomendacion === null ? '—' : fila.recomendacion.toFixed(2).replace('.', ',')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={estilos.notaBloque}>Notas de 1 a 7. NPS: promotor 7, pasivo 6, detractor 5 o menos.</p>
    </section>
  );
}

const TITULO_EJE_LEADS: Record<string, string> = {
  valoracion: 'Leads por temperatura',
  concesionario: 'Leads por concesionario',
  punto_venta: 'Leads por punto de venta',
  modelo_interes: 'Leads por modelo de interés',
  estado: 'Leads por estado',
  origen: 'Leads por origen',
  utm_origen: 'Leads por fuente digital',
  dueno: 'Leads por vendedor',
  fecha: 'Leads por día',
  total: 'Leads',
};

const TEMPERATURAS: Array<{
  clave: 'superCalientes' | 'calientes' | 'tibios' | 'frios';
  etiqueta: string;
  clase: string;
}> = [
  { clave: 'superCalientes', etiqueta: 'Super caliente', clase: estilos.calor4 ?? '' },
  { clave: 'calientes', etiqueta: 'Caliente', clase: estilos.calor3 ?? '' },
  { clave: 'tibios', etiqueta: 'Tibio', clase: estilos.calor2 ?? '' },
  { clave: 'frios', etiqueta: 'Frío', clase: estilos.calor1 ?? '' },
];

function VistaLeads({ datos }: { datos: AnalisisLeads }) {
  const titulo = TITULO_EJE_LEADS[datos.eje] ?? 'Leads';
  const maximo = datos.filas.reduce((tope, fila) => Math.max(tope, fila.leads), 0);

  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo={titulo} periodo={datos.periodo} />
        <p className={estilos.actividadFila}>No hay leads en este período.</p>
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
              {fila.etiqueta}
            </span>
            <span className={estilos.cifraFila}>{formatearNumero(fila.leads)}</span>
            <div
              className={`${estilos.medidor} ${estilos.medidorLeads}`}
              style={{ width: `${maximo === 0 ? 0 : (fila.leads / maximo) * 100}%` }}
            >
              {TEMPERATURAS.map(({ clave, etiqueta, clase }) => {
                const valor = fila[clave];
                if (valor === 0) return null;
                return (
                  <span
                    key={clave}
                    className={`${estilos.tramo} ${clase}`}
                    style={{ width: `${(valor / fila.leads) * 100}%` }}
                    title={`${etiqueta}: ${valor}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className={estilos.notaBloque}>
        {TEMPERATURAS.map(({ etiqueta, clase }) => (
          <span className={estilos.leyenda} key={etiqueta}>
            <span className={`${estilos.puntoLeyenda} ${clase}`} />
            {etiqueta}
          </span>
        ))}
      </p>
    </section>
  );
}

function VistaLlamadas({ datos }: { datos: AnalisisLlamadas }) {
  if (datos.filas.length === 0) {
    return (
      <section className={estilos.bloque}>
        <Encabezado titulo="Telefonía" periodo={datos.periodo} />
        <p className={estilos.actividadFila}>No hay llamadas en este período.</p>
      </section>
    );
  }

  return (
    <section className={estilos.bloque}>
      <Encabezado titulo="Telefonía" periodo={datos.periodo} />
      <div className={estilos.envoltorioTabla}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">Grupo</th>
              <th scope="col" className={estilos.celdaNumerica}>Llamadas</th>
              <th scope="col" className={estilos.celdaNumerica}>Atendidas</th>
              <th scope="col" className={estilos.celdaNumerica}>Atención</th>
              <th scope="col" className={estilos.celdaNumerica}>Minutos</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((fila) => (
              <tr key={fila.etiqueta}>
                <td title={fila.etiqueta}>{fila.etiqueta}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.llamadas)}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.atendidas)}</td>
                <td className={estilos.celdaNumerica}>{formatearPorcentaje(fila.porcentajeAtencion)}</td>
                <td className={estilos.celdaNumerica}>{formatearNumero(fila.minutosHablados)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const TITULO_HERRAMIENTA: Record<string, string> = {
  valores_dimension: 'Valores en la base',
  buscar_cliente: 'Clientes',
  buscar_lead: 'Leads',
  buscar_llamadas: 'Llamadas',
  anexos_telefonia: 'Anexos telefónicos',
  historial_vehiculo: 'Historial del vehículo',
  consulta_sql: 'Consulta a medida',
  listar_tablas: 'Tablas',
  describir_tabla: 'Estructura de la tabla',
};

/**
 * Renderiza un bloque de datos según el formato que declaró la herramienta.
 * Si el resultado no encaja con la forma esperada, cae en la vista de tabla.
 */
export function BloqueDeDatos({ bloque }: { bloque: BloqueDatos }) {
  const titulo = TITULO_HERRAMIENTA[bloque.herramienta] ?? 'Resultado';

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
