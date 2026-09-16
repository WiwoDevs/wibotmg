import { consultarGestion, hayBaseGestion } from './gestion-base.js';

export interface TablaGestion {
  nombre: string;
  descripcion: string;
  columnas: Array<{ columna: string; descripcion: string; personal?: boolean }>;
}

/**
 * Diccionario de la base de gestión: lo que el modelo lee para saber qué puede
 * preguntar sobre encuestas, leads y telefonía.
 */
export const TABLAS_GESTION: TablaGestion[] = [
  {
    nombre: 'encuestas',
    descripcion:
      'Encuestas de posventa respondidas por clientes después de un servicio. Una fila por respuesta. Las notas van de 1 a 7.',
    columnas: [
      { columna: 'identrega', descripcion: 'Identificador de la entrega encuestada' },
      { columna: 'concesionario', descripcion: 'Concesionario que atendió' },
      { columna: 'sucursal', descripcion: 'Sucursal donde se hizo el servicio' },
      { columna: 'rut', descripcion: 'RUT del cliente', personal: true },
      { columna: 'nombre', descripcion: 'Nombre del cliente', personal: true },
      { columna: 'email', descripcion: 'Correo del cliente', personal: true },
      { columna: 'celular', descripcion: 'Celular del cliente', personal: true },
      { columna: 'fecha', descripcion: 'Fecha de la respuesta (YYYY-MM-DD)' },
      { columna: 'nota_sucursal', descripcion: 'Limpieza y ambiente de la sucursal, 1 a 7' },
      { columna: 'nota_tiempo_espera', descripcion: 'Tiempo de espera hasta ser atendido, 1 a 7' },
      { columna: 'nota_entrega', descripcion: 'Atención en la entrega o retiro del vehículo, 1 a 7' },
      { columna: 'explico_trabajos', descripcion: '1 si el asesor explicó los trabajos, 0 si no' },
      { columna: 'cumplio_fecha', descripcion: '1 si se cumplió la fecha y hora de entrega, 0 si no' },
      { columna: 'vehiculo_limpio', descripcion: '1 si el vehículo estaba limpio al entregarlo, 0 si no' },
      { columna: 'nota_satisfaccion', descripcion: 'Satisfacción general con el servicio técnico, 1 a 7' },
      { columna: 'regreso_taller', descripcion: '1 si el vehículo volvió al taller por trabajos incompletos' },
      { columna: 'nota_recomendacion', descripcion: 'Probabilidad de recomendar MG, 1 a 7. Es la base del NPS' },
      { columna: 'mes_encuesta', descripcion: 'Mes y año de la campaña, por ejemplo "Agosto 2026"' },
      { columna: 'vin', descripcion: 'VIN del vehículo' },
    ],
  },
  {
    nombre: 'encuestas_envios',
    descripcion:
      'Envíos de la campaña de encuesta: a quién se le mandó y si la abrió. Sirve para medir la tasa de apertura, no la satisfacción.',
    columnas: [
      { columna: 'contacto_id', descripcion: 'Identificador del contacto en la plataforma de envío' },
      { columna: 'nombre', descripcion: 'Nombre del destinatario', personal: true },
      { columna: 'email', descripcion: 'Correo del destinatario', personal: true },
      { columna: 'estado', descripcion: '"Entregado" o "Abierto"' },
      { columna: 'fecha', descripcion: 'Fecha del último cambio de estado' },
      { columna: 'campania', descripcion: 'Archivo de campaña del que salió el envío' },
    ],
  },
  {
    nombre: 'leads',
    descripcion:
      'Leads comerciales tibios y fríos del CRM, con su valoración de temperatura, el punto de venta asignado y la campaña de origen.',
    columnas: [
      { columna: 'fecha', descripcion: 'Fecha de creación del lead (YYYY-MM-DD)' },
      { columna: 'origen', descripcion: 'Origen del candidato, por ejemplo "SAIC Website"' },
      { columna: 'estado', descripcion: 'Estado en el CRM: Asignado, Enviado, Siguiendo, Convertido, Cerrado / Perdido' },
      { columna: 'nombre', descripcion: 'Nombre del lead', personal: true },
      { columna: 'apellidos', descripcion: 'Apellidos del lead', personal: true },
      { columna: 'rut', descripcion: 'RUT del lead', personal: true },
      { columna: 'email', descripcion: 'Correo del lead', personal: true },
      { columna: 'telefono', descripcion: 'Teléfono del lead', personal: true },
      { columna: 'movil', descripcion: 'Móvil del lead', personal: true },
      { columna: 'genero', descripcion: 'Género declarado' },
      { columna: 'dueno', descripcion: 'Vendedor dueño del lead', personal: true },
      { columna: 'convertido', descripcion: '1 si el lead se convirtió en venta' },
      { columna: 'codigo_campania', descripcion: 'Código de la campaña' },
      { columna: 'id_registro', descripcion: 'Identificador del registro en el CRM' },
      { columna: 'codigo_pdv', descripcion: 'Código del punto de venta' },
      { columna: 'punto_venta', descripcion: 'Punto de venta asignado, por ejemplo "Pompeyo Movicenter"' },
      { columna: 'concesionario', descripcion: 'Concesionario dueño del punto de venta' },
      { columna: 'categoria', descripcion: 'Categoría del lead: Personal, Empresa, etc' },
      { columna: 'utm_origen', descripcion: 'utm_source de la campaña digital' },
      { columna: 'utm_medio', descripcion: 'utm_medium de la campaña digital' },
      { columna: 'utm_campania', descripcion: 'utm_campaign de la campaña digital' },
      { columna: 'fecha_asignacion', descripcion: 'Cuándo se asignó a un vendedor' },
      { columna: 'fecha_inicio_seguimiento', descripcion: 'Cuándo empezó el seguimiento' },
      { columna: 'dias_hasta_seguimiento', descripcion: 'Días entre la asignación y el primer seguimiento' },
      { columna: 'fuente_detallada', descripcion: 'Fuente del lead con más detalle' },
      { columna: 'no_gestionado', descripcion: '1 si el lead quedó sin gestionar' },
      { columna: 'descripcion', descripcion: 'Notas del vendedor sobre el lead' },
      { columna: 'version_interes', descripcion: 'Versión concreta del modelo que le interesa' },
      { columna: 'modelo_interes', descripcion: 'Modelo de interés: MGZX, MG ZS, MG 3, etc' },
      { columna: 'valoracion', descripcion: 'Temperatura del lead: Super Caliente, Caliente, Tibio, Frío' },
    ],
  },
  {
    nombre: 'llamadas',
    descripcion:
      'Registro de la central telefónica: una fila por tramo de llamada, con duración, costo y, cuando existe, resumen y transcripción.',
    columnas: [
      { columna: 'momento', descripcion: 'Fecha y hora de la llamada' },
      { columna: 'fecha', descripcion: 'Solo la fecha, para agrupar por día' },
      { columna: 'llamada_id', descripcion: 'Identificador de la llamada; varios tramos comparten el mismo' },
      { columna: 'origen', descripcion: 'Quién llama', personal: true },
      { columna: 'destino', descripcion: 'A quién se llama', personal: true },
      { columna: 'direccion', descripcion: 'Inbound, Outbound o Inbound Queue' },
      { columna: 'estado', descripcion: 'Answered, Unanswered o Waiting' },
      { columna: 'segundos_timbrando', descripcion: 'Segundos que estuvo timbrando' },
      { columna: 'segundos_hablando', descripcion: 'Segundos de conversación' },
      { columna: 'costo', descripcion: 'Costo del tramo' },
      { columna: 'detalle', descripcion: 'Detalle técnico del enrutamiento' },
      { columna: 'sentimiento', descripcion: 'Sentimiento detectado. En los datos actuales viene vacío' },
      { columna: 'resumen', descripcion: 'Resumen automático de la conversación', personal: true },
      { columna: 'transcripcion', descripcion: 'Transcripción de la conversación', personal: true },
    ],
  },
  {
    nombre: 'anexos',
    descripcion:
      'Estadísticas acumuladas por anexo telefónico: atendidas y perdidas, entrantes y salientes, y tiempo total hablado.',
    columnas: [
      { columna: 'anexo', descripcion: 'Anexo o agente' },
      { columna: 'entrantes_atendidas', descripcion: 'Llamadas entrantes atendidas' },
      { columna: 'entrantes_perdidas', descripcion: 'Llamadas entrantes no atendidas' },
      { columna: 'salientes_atendidas', descripcion: 'Llamadas salientes atendidas' },
      { columna: 'salientes_perdidas', descripcion: 'Llamadas salientes no atendidas' },
      { columna: 'total_atendidas', descripcion: 'Total atendidas' },
      { columna: 'total_perdidas', descripcion: 'Total perdidas' },
      { columna: 'segundos_hablando', descripcion: 'Segundos totales de conversación' },
      { columna: 'sentimiento', descripcion: 'Sentimiento agregado. En los datos actuales viene vacío' },
    ],
  },
];

/** Columnas personales de la base de gestión, en minúsculas. */
export const COLUMNAS_PERSONALES_GESTION: ReadonlySet<string> = new Set(
  TABLAS_GESTION.flatMap((tabla) =>
    tabla.columnas.filter((columna) => columna.personal).map((columna) => columna.columna.toLowerCase()),
  ),
);

/** Nombres de las tablas que una consulta libre puede leer. */
export const TABLAS_GESTION_PERMITIDAS: ReadonlySet<string> = new Set(
  TABLAS_GESTION.map((tabla) => tabla.nombre),
);

export interface EstadoBaseGestion {
  disponible: boolean;
  ruta?: string;
  tablas: Array<{ nombre: string; filas: number }>;
  ultimaImportacion?: string;
}

/**
 * Estado de la base de gestión: si existe, cuántas filas tiene cada tabla y
 * cuándo se importó por última vez.
 */
export function estadoBaseGestion(): EstadoBaseGestion {
  if (!hayBaseGestion()) return { disponible: false, tablas: [] };

  const tablas = TABLAS_GESTION.map((tabla) => {
    const fila = consultarGestion<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla.nombre}`)[0];
    return { nombre: tabla.nombre, filas: Number(fila?.n ?? 0) };
  });

  const importacion = consultarGestion<{ ocurrido_en: string }>(
    'SELECT ocurrido_en FROM importaciones ORDER BY id DESC LIMIT 1',
  )[0];

  return {
    disponible: true,
    tablas,
    ...(importacion ? { ultimaImportacion: importacion.ocurrido_en } : {}),
  };
}
