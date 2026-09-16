import { obtenerConfiguracion } from './config.js';
import { ejecutarSelect } from './pool.js';
import type { RowDataPacket } from 'mysql2/promise';

/** Nombre lógico (sin prefijo) de la tabla con los cupones de servicio. */
export const TABLA_CUPONES = 'coupon_file_data';

/**
 * Devuelve el nombre real de una tabla, con el prefijo de WordPress aplicado
 * y entrecomillado para usarse dentro de una sentencia SQL.
 *
 * @param nombreLogico nombre sin prefijo, por ejemplo `coupon_file_data`.
 */
export function tabla(nombreLogico: string): string {
  const { db } = obtenerConfiguracion();
  const sinPrefijo = nombreLogico.startsWith(db.prefijoTablas)
    ? nombreLogico.slice(db.prefijoTablas.length)
    : nombreLogico;
  return `\`${db.prefijoTablas}${sinPrefijo.replace(/`/g, '')}\``;
}

export interface DescripcionColumna {
  columna: string;
  descripcion: string;
  /** true si contiene datos personales identificables. */
  personal?: boolean;
}

/**
 * Diccionario de la tabla de cupones, en el idioma del negocio.
 * Es lo que el modelo lee para entender qué puede preguntar.
 */
export const DICCIONARIO_CUPONES: DescripcionColumna[] = [
  { columna: 'id', descripcion: 'Identificador único del cupón' },
  { columna: 'Origen', descripcion: 'Cómo entró el registro: "Carga" (masiva) o "Manual"' },
  { columna: 'FechaCreacion', descripcion: 'Fecha en que se generó el cupón (date). Es la fecha de referencia para "hoy", "ayer", "este mes"' },
  { columna: 'Usuario', descripcion: 'Usuario del sistema que cargó el registro', personal: true },
  { columna: 'NombreConcesionario', descripcion: 'Concesionario / holding, por ejemplo "Salazar Israel", "Pompeyo", "Cartoni"' },
  { columna: 'RutConcesionario', descripcion: 'RUT del concesionario' },
  { columna: 'NombreLocal', descripcion: 'Sucursal concreta donde se atendió' },
  { columna: 'idLocal', descripcion: 'Identificador numérico de la sucursal' },
  { columna: 'RutAsesor', descripcion: 'RUT del asesor de servicio', personal: true },
  { columna: 'Asesor', descripcion: 'Nombre del asesor de servicio que gestionó el cupón', personal: true },
  { columna: 'EmailAsesor', descripcion: 'Correo del asesor', personal: true },
  { columna: 'TipoEvento', descripcion: 'Tipo de evento; casi siempre "Cupón Servicio". Campo sucio: hay variantes y valores basura' },
  { columna: 'TipoDocumento', descripcion: 'Naturaleza del trabajo: Mantenimiento, Mecánica, D&P, Garantía, Otro' },
  { columna: 'Descripcion', descripcion: 'Texto libre del trabajo realizado' },
  { columna: 'KM', descripcion: 'Kilometraje del vehículo al momento de la atención' },
  { columna: 'OT', descripcion: 'Número de orden de trabajo' },
  { columna: 'FechaOT', descripcion: 'Fecha y hora de la orden de trabajo' },
  { columna: 'FechaFactura', descripcion: 'Fecha de facturación' },
  { columna: 'FechaEntrega', descripcion: 'Fecha de entrega del vehículo al cliente' },
  { columna: 'Vin', descripcion: 'VIN del vehículo (identificador único de chasis)' },
  { columna: 'Patente', descripcion: 'Patente / placa del vehículo' },
  { columna: 'Modelo', descripcion: 'Modelo comercial del vehículo' },
  { columna: 'Familia', descripcion: 'Familia del modelo (MG ZS, MG3, etc). Campo sucio: conviven "MG_ZS" y "MG ZS"' },
  { columna: 'Año', descripcion: 'Año del vehículo' },
  { columna: 'Color', descripcion: 'Color del vehículo' },
  { columna: 'TipoCliente', descripcion: 'Segmento del cliente (persona natural, empresa, etc)' },
  { columna: 'RutCliente', descripcion: 'RUT del cliente', personal: true },
  { columna: 'Nombres', descripcion: 'Nombres del cliente', personal: true },
  { columna: 'Paterno', descripcion: 'Apellido paterno del cliente', personal: true },
  { columna: 'Materno', descripcion: 'Apellido materno del cliente', personal: true },
  { columna: 'RazonSocial', descripcion: 'Razón social si el cliente es empresa', personal: true },
  { columna: 'Direccion', descripcion: 'Dirección del cliente', personal: true },
  { columna: 'Comuna', descripcion: 'Comuna del cliente' },
  { columna: 'Telefono', descripcion: 'Teléfono fijo del cliente', personal: true },
  { columna: 'Celular', descripcion: 'Celular del cliente', personal: true },
  { columna: 'Email', descripcion: 'Correo del cliente', personal: true },
  { columna: 'Ciudad', descripcion: 'Ciudad del cliente' },
  { columna: 'NombreRegion', descripcion: 'Región del cliente' },
  { columna: 'FechaNacimiento', descripcion: 'Fecha de nacimiento del cliente', personal: true },
  { columna: 'Edad', descripcion: 'Edad del cliente' },
  { columna: 'Sexo', descripcion: 'Sexo del cliente' },
  { columna: 'Contacto', descripcion: 'Nombre del contacto alternativo', personal: true },
  { columna: 'TelefonoContacto', descripcion: 'Teléfono del contacto alternativo', personal: true },
  { columna: 'EmailContacto', descripcion: 'Correo del contacto alternativo', personal: true },
  { columna: 'csv_id', descripcion: 'Identificador del archivo CSV de origen' },
];

/** Columnas con datos personales, en minúsculas, para aplicar la política de privacidad. */
export const COLUMNAS_PERSONALES: ReadonlySet<string> = new Set(
  DICCIONARIO_CUPONES.filter((c) => c.personal).map((c) => c.columna.toLowerCase()),
);

/**
 * Expresiones SQL que limpian los campos sucios del origen.
 * Úsalas en GROUP BY para no partir un mismo valor en varias filas.
 */
export const EXPRESIONES_NORMALIZADAS = {
  /** "MG_ZS" y "MG ZS" colapsan en "MG ZS". */
  familia: "NULLIF(UPPER(TRIM(REPLACE(REPLACE(Familia, '_', ' '), '  ', ' '))), '')",
  /** Quita entidades HTML y unifica mayúsculas. */
  tipoEvento: "NULLIF(UPPER(TRIM(REPLACE(REPLACE(TipoEvento, '&lt;', ''), '&gt;', ''))), '')",
  /** Modelo en mayúsculas y sin guiones bajos. */
  modelo: "NULLIF(UPPER(TRIM(REPLACE(Modelo, '_', ' '))), '')",
  concesionario: "NULLIF(TRIM(NombreConcesionario), '')",
  local: "NULLIF(TRIM(NombreLocal), '')",
  asesor: "NULLIF(TRIM(Asesor), '')",
} as const;

interface FilaTabla extends RowDataPacket {
  nombre: string;
  filas: number;
  comentario: string | null;
}

export interface ResumenTabla {
  nombre: string;
  filasAproximadas: number;
}

/**
 * Lista las tablas disponibles en la base configurada con su volumen aproximado.
 * El conteo viene de information_schema, así que es una estimación barata.
 */
export async function listarTablas(): Promise<ResumenTabla[]> {
  const { db } = obtenerConfiguracion();
  const { filas } = await ejecutarSelect<FilaTabla>(
    `SELECT TABLE_NAME AS nombre, TABLE_ROWS AS filas, TABLE_COMMENT AS comentario
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_ROWS DESC`,
    [db.database],
    500,
  );
  return filas.map((fila) => ({ nombre: fila.nombre, filasAproximadas: Number(fila.filas ?? 0) }));
}

interface FilaColumna extends RowDataPacket {
  columna: string;
  tipo: string;
  nulo: string;
  clave: string;
}

export interface ColumnaTabla {
  columna: string;
  tipo: string;
  aceptaNulos: boolean;
  esClave: boolean;
  descripcion?: string;
  personal: boolean;
}

/**
 * Describe las columnas de una tabla, sumando el diccionario de negocio
 * cuando la tabla es la de cupones.
 *
 * @param nombreTabla nombre real o lógico de la tabla.
 * @throws {Error} si la tabla no existe en la base configurada.
 */
export async function describirTabla(nombreTabla: string): Promise<ColumnaTabla[]> {
  const { db } = obtenerConfiguracion();
  const real = nombreTabla.startsWith(db.prefijoTablas)
    ? nombreTabla
    : `${db.prefijoTablas}${nombreTabla}`;

  const { filas } = await ejecutarSelect<FilaColumna>(
    `SELECT COLUMN_NAME AS columna, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_KEY AS clave
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [db.database, real],
    500,
  );

  if (filas.length === 0) {
    throw new Error(`La tabla "${nombreTabla}" no existe en la base ${db.database}`);
  }

  const glosario = new Map(DICCIONARIO_CUPONES.map((c) => [c.columna.toLowerCase(), c]));

  return filas.map((fila) => {
    const entrada = glosario.get(fila.columna.toLowerCase());
    return {
      columna: fila.columna,
      tipo: fila.tipo,
      aceptaNulos: fila.nulo === 'YES',
      esClave: fila.clave !== '',
      ...(entrada ? { descripcion: entrada.descripcion } : {}),
      personal: COLUMNAS_PERSONALES.has(fila.columna.toLowerCase()),
    };
  });
}

let cacheNombresTablas: Set<string> | undefined;

/**
 * Conjunto de nombres de tabla reales permitidos en consultas libres.
 * Se cachea porque se consulta en cada validación de SQL.
 */
export async function obtenerTablasPermitidas(): Promise<ReadonlySet<string>> {
  if (cacheNombresTablas) return cacheNombresTablas;
  const tablas = await listarTablas();
  cacheNombresTablas = new Set(tablas.map((t) => t.nombre.toLowerCase()));
  return cacheNombresTablas;
}
