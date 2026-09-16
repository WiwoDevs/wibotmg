export { obtenerConfiguracion, reiniciarConfiguracion } from './config.js';
export type { ConfiguracionWiBot, ModoPrivacidad } from './config.js';

export { obtenerPool, cerrarPool, ejecutarSelect } from './pool.js';
export type { ResultadoConsulta } from './pool.js';

export {
  TABLA_CUPONES,
  tabla,
  DICCIONARIO_CUPONES,
  COLUMNAS_PERSONALES,
  EXPRESIONES_NORMALIZADAS,
  listarTablas,
  describirTabla,
  obtenerTablasPermitidas,
} from './catalogo.js';
export type { ColumnaTabla, DescripcionColumna, ResumenTabla } from './catalogo.js';

export { validarSelect, SqlRechazadoError } from './guardia-sql.js';
export type { SqlValidado } from './guardia-sql.js';

export { consultaLibre } from './consulta-libre.js';
export type { ResultadoConsultaLibre } from './consulta-libre.js';

export {
  aplicarPolitica,
  enmascararRut,
  enmascararEmail,
  enmascararTelefono,
  enmascararNombre,
} from './privacidad.js';
export type { OpcionesPolitica, ResultadoPolitica } from './privacidad.js';

export { resolverPeriodo, hoyLocal } from './fechas.js';
export type { EntradaPeriodo, Periodo, PeriodoRelativo } from './fechas.js';

export {
  resumenOperacion,
  ranking,
  serieTemporal,
  buscarCliente,
  historialVehiculo,
  valoresDimension,
} from './consultas.js';
export type {
  Dimension,
  FiltrosCupones,
  Granularidad,
  Ranking,
  FilaRanking,
  ResumenOperacion,
  SerieTemporal,
  ValorDimension,
  FichaCliente,
  AtencionVehiculo,
} from './consultas.js';

export { HERRAMIENTAS, obtenerHerramienta, herramientasComoJsonSchema } from './herramientas.js';
export type { Herramienta, FormatoResultado, HerramientaJsonSchema } from './herramientas.js';
