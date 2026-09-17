# API de WiBot

Referencia para integrar WiBot desde otro proyecto: el chat sobre la base de MG Contact y los
datos del tablero ejecutivo.

Todo cuelga de la misma aplicación Next.js (`apps/web`). En desarrollo es
`http://localhost:3100`; en producción, el dominio donde esté desplegada. En esta guía se la
llama `WIBOT`.

- [Autenticación](#autenticación)
- [CORS](#cors)
- [Errores](#errores)
- [`POST /api/chat`](#post-apichat)
- [`GET /api/tablero`](#get-apitablero)
- [Sesión de personas](#sesión-de-personas)
- [`GET /api/diagnostico`](#get-apidiagnostico)
- [Integrar desde otro proyecto](#integrar-desde-otro-proyecto)

---

## Autenticación

WiBot no tiene rutas públicas. Hay dos formas de identificarse, y cada una es para un caso
distinto:

| Forma | Para qué | Cómo viaja |
|---|---|---|
| **Token de servicio** | Otro sistema consumiendo la API | `Authorization: Bearer wibot_...` |
| **Cookie de sesión** | Una persona usando la aplicación web de WiBot | Cookie `wibot_sesion`, `httpOnly` |

Para integrar otro proyecto se usa **token de servicio**. Se dan de alta por consola en el
servidor de WiBot:

```bash
npm run tokens -- crear <nombre> [origen...]   # el token se muestra una sola vez
npm run tokens -- listar                       # estado y último uso
npm run tokens -- revocar <nombre>             # deja de funcionar en el acto
```

Los `origen` son las páginas que van a llamar **desde el navegador**, con esquema y puerto
(`https://sitio.cl`). Un token sin orígenes sirve solo de servidor a servidor.

```bash
npm run tokens -- crear panel-comercial https://panel.mgcontact.cl
```

En cada petición:

```
Authorization: Bearer wibot_CELDKO_kmE4j9dUZPklg5-tb160oA2kdd2ZYPEpEmX0
```

Reglas que conviene tener claras antes de escribir la integración:

- **El token es la credencial completa.** Quien lo tenga consulta la base de clientes. Si la
  página que integra es pública, el token vive en su servidor y es ese servidor el que llama a
  WiBot; puesto en el JavaScript del navegador, cualquiera lo copia del inspector.
- **En la base de WiBot solo queda el SHA-256 del token.** Si se pierde, no se recupera: se
  revoca y se crea otro.
- **Un token entra a todo**: `/api/chat` y `/api/tablero`. No hay permisos por endpoint.
- **Cada consulta queda auditada** con `token:<nombre>` en lugar de un correo
  (`npm run usuarios -- auditoria`).
- **No hay límite de frecuencia por token.** Cada pregunta al chat es una llamada a Gemini que
  se paga: si la otra página consulta seguido, que cachee del lado de ella.

## CORS

Solo hace falta cuando la llamada sale del navegador. La lista blanca es por token: el origen
tiene que figurar en algún token **activo**.

- El preflight `OPTIONS` responde `204` con `Access-Control-Allow-Origin`,
  `Access-Control-Allow-Methods: GET, POST, OPTIONS` y
  `Access-Control-Allow-Headers: authorization, content-type`. Si el origen no figura en ningún
  token activo, responde `403` sin cabeceras.
- La petición real devuelve `Access-Control-Allow-Origin` con el origen que llamó, siempre que
  el token lo tenga autorizado. Si no, `403` con
  `{"error":"Este origen no está autorizado para el token."}`.
- **La lista de orígenes no es la barrera de seguridad**, es lo que el navegador exige. Una
  llamada con `curl` no manda `Origin` y pasa igual: lo que autoriza es el token.
- La cookie de sesión nunca abre CORS: es el camino de la propia aplicación.

## Errores

Todas las rutas devuelven el mismo sobre, con el mensaje ya redactado para mostrarle a una
persona:

```json
{ "error": "Token de servicio inválido o revocado." }
```

| Código | Cuándo |
|---|---|
| `400` | Falta un parámetro, tiene formato inválido o el cuerpo no es JSON |
| `401` | Sin credencial, token revocado o sesión vencida |
| `403` | El origen no está autorizado para ese token |
| `404` | Ruta apagada por configuración (`/api/diagnostico` sin `WIBOT_DEV=1`) |
| `429` | Demasiados intentos fallidos de inicio de sesión |
| `500` | La consulta falló del lado del servidor |

En `/api/chat` hay una excepción importante: si la respuesta ya empezó a transmitirse, el estado
HTTP ya es `200` y el error llega **dentro del flujo**, como un evento `{"tipo":"error"}`. Hay
que contemplar los dos caminos.

---

## `POST /api/chat`

Le hace una pregunta en castellano a WiBot. El servidor decide qué herramientas consultar contra
la base, y devuelve un **flujo NDJSON**: un objeto JSON por línea, a medida que se genera. No hay
una respuesta final única que esperar.

**Cabeceras**

```
Authorization: Bearer wibot_...
Content-Type: application/json
```

**Cuerpo**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `pregunta` | `string` | sí | Máximo 2.000 caracteres. No puede quedar vacía al recortar espacios |
| `historial` | `Turno[]` | no | Contexto de la conversación. Se toman los **últimos 12** turnos; el resto se descarta |

```ts
interface Turno {
  autor: 'persona' | 'wibot';
  texto: string;   // no puede ser vacío
}
```

Los turnos con otro `autor`, o sin texto, se ignoran en silencio: mandar historial sucio no
produce un error, produce menos contexto.

**Respuesta**

`200 OK` con `Content-Type: application/x-ndjson; charset=utf-8`. Cada línea es uno de estos
eventos:

```ts
type EventoChat =
  | { tipo: 'consultando'; herramienta: string; argumentos: Record<string, unknown> }
  | { tipo: 'datos'; herramienta: string; formato: FormatoResultado; resultado: unknown }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'diagnostico'; evento: EventoDiagnostico }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'fin' };
```

| Evento | Qué hacer con él |
|---|---|
| `consultando` | WiBot fue a la base. Sirve para mostrar "consultando…" con el nombre de la herramienta |
| `datos` | El resultado crudo de esa consulta. Es el que se usa para dibujar tablas o gráficos |
| `texto` | Fragmento de la respuesta escrita. Se van concatenando los `delta` en orden |
| `diagnostico` | Registro técnico. **Solo aparece con `WIBOT_DEV=1`**; en producción no llega nunca |
| `error` | Algo falló a mitad de camino. El `mensaje` ya está redactado para mostrar |
| `fin` | Cierre del turno. Siempre llega, también después de un `error` |

Un turno completo, con la forma exacta que tiene en el flujo y cifras de ejemplo:

```
{"tipo":"consultando","herramienta":"resumen_operacion","argumentos":{"desde":"2026-08-01","hasta":"2026-08-31"}}
{"tipo":"datos","herramienta":"resumen_operacion","formato":"resumen","resultado":{"periodo":{"desde":"2026-08-01","hasta":"2026-08-31","etiqueta":"agosto de 2026"},"cupones":7204,"concesionarios":19,"locales":52,"asesores":416,"clientes":6688,"vehiculos":6931,"kilometrajePromedio":24817.4,"porTipoDocumento":[{"tipoDocumento":"Mantenimiento","cupones":5120}]}}
{"tipo":"texto","delta":"En agosto de 2026 se emitieron "}
{"tipo":"texto","delta":"7.204 cupones de servicio."}
{"tipo":"fin"}
```

### Qué trae `resultado` según `formato`

El campo `formato` dice cómo presentar el `resultado`. Son ocho formas, y cada herramienta usa
siempre la misma:

| `formato` | Herramientas | Forma de `resultado` |
|---|---|---|
| `resumen` | `resumen_operacion` | `ResumenOperacion` |
| `ranking` | `ranking` | `Ranking` |
| `serie` | `serie_temporal` | `SerieTemporal` |
| `encuestas` | `encuestas_posventa` | `AnalisisEncuestas` |
| `leads` | `leads` | `AnalisisLeads` |
| `llamadas` | `llamadas` | `AnalisisLlamadas` |
| `tabla` | `valores_dimension`, `buscar_cliente`, `historial_vehiculo`, `consulta_sql`, `buscar_lead`, `buscar_llamadas`, `anexos_telefonia`, `listar_tablas`, `describir_tabla` | Filas sueltas; la forma depende de la herramienta |
| `texto` | `esquema_cupones`, `esquema_gestion` | Texto plano con el diccionario de la base |

Los tipos, tal como los define `packages/core`:

```ts
interface Periodo {
  desde: string;      // YYYY-MM-DD
  hasta: string;      // YYYY-MM-DD
  etiqueta: string;   // "agosto de 2026"
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

type Dimension =
  | 'concesionario' | 'local' | 'asesor' | 'tipoDocumento'
  | 'familia' | 'modelo' | 'region' | 'comuna';

interface Ranking {
  periodo: Periodo;
  dimension: Dimension;
  total: number;
  filas: Array<{
    etiqueta: string;
    cupones: number;
    clientes: number;
    participacion: number;   // porcentaje sobre el total
  }>;
}

interface SerieTemporal {
  periodo: Periodo;
  granularidad: 'dia' | 'semana' | 'mes';
  puntos: Array<{ intervalo: string; cupones: number }>;
}

interface AnalisisEncuestas {
  periodo: Periodo;
  eje: 'total' | 'concesionario' | 'sucursal' | 'mes';
  notaSobreNps: string;    // advertencia metodológica, conviene mostrarla
  filas: Array<{
    etiqueta: string;
    respuestas: number;
    satisfaccion: number | null;    // notas de 1 a 7
    recomendacion: number | null;
    sucursal: number | null;
    tiempoEspera: number | null;
    entrega: number | null;
    nps: number | null;             // -100 a 100
    promotores: number;
    detractores: number;
    porcentajeExplicoTrabajos: number | null;
    porcentajeCumplioFecha: number | null;
    porcentajeVehiculoLimpio: number | null;
    porcentajeRegresoTaller: number | null;
  }>;
}

interface AnalisisLeads {
  periodo: Periodo;
  eje: 'total' | 'valoracion' | 'concesionario' | 'punto_venta'
     | 'modelo_interes' | 'estado' | 'origen' | 'vendedor';
  total: number;
  filas: Array<{
    etiqueta: string;
    leads: number;
    superCalientes: number;
    calientes: number;
    tibios: number;
    frios: number;
    convertidos: number;
    noGestionados: number;
    porcentajeConversion: number | null;
    diasPromedioHastaSeguimiento: number | null;
  }>;
}

interface AnalisisLlamadas {
  periodo: Periodo;
  eje: 'total' | 'direccion' | 'estado' | 'fecha' | 'origen' | 'destino';
  filas: Array<{
    etiqueta: string;
    llamadas: number;
    atendidas: number;
    sinAtender: number;
    porcentajeAtencion: number | null;
    minutosHablados: number;
    segundosPromedioEspera: number | null;
    costo: number;
  }>;
}
```

`consulta_sql` es el único caso con forma propia dentro de `tabla`:

```ts
interface ResultadoConsultaLibre {
  sqlEjecutado: string;
  filas: Array<Record<string, unknown>>;
  columnas: string[];
  cantidadFilas: number;
  truncado: boolean;            // se alcanzó el límite de filas
  limiteAgregado: boolean;      // WiBot agregó el LIMIT que faltaba
  columnasEnmascaradas: string[];
  msTranscurridos: number;
}
```

### Datos personales

`buscar_cliente` y `historial_vehiculo` devuelven RUT, nombre, correo y teléfono. La variable
`PII_MODE` del servidor decide qué llega:

| `PII_MODE` | Qué devuelve |
|---|---|
| `aggregate` *(por defecto)* | Enmascarado en todas las herramientas salvo `buscar_cliente` e `historial_vehiculo` |
| `masked` | Enmascarado siempre |
| `full` | Sin restricción |

Las respuestas que pasaron por la política traen `columnasEnmascaradas` con los nombres de las
columnas afectadas. Si la integración va a mostrar estos datos, revisá qué `PII_MODE` corre en
el servidor antes de asumir que vas a recibirlos completos.

---

## `GET /api/tablero`

Devuelve, en una sola llamada, todo lo que muestra el tablero ejecutivo: indicadores, serie de
cupones, ranking de concesionarios, NPS, temperatura de leads, puntos de venta, telefonía y
anexos. No pasa por el modelo: es consulta directa a la base, así que es rápida y barata.

**Parámetros** (los dos obligatorios, en la query)

| Parámetro | Formato | Notas |
|---|---|---|
| `desde` | `YYYY-MM-DD` | Fecha inicial |
| `hasta` | `YYYY-MM-DD` | Fecha final. No puede ser anterior a `desde` |

```bash
curl -H "Authorization: Bearer wibot_..." \
  "$WIBOT/api/tablero?desde=2026-08-01&hasta=2026-08-31"
```

**Respuesta**

```ts
interface DatosTablero {
  periodo: { desde: string; hasta: string; etiqueta: string };
  generadoEn: string;        // ISO 8601
  hayGestion: boolean;       // false si el SQLite de gestión no fue importado
  indicadores: Indicador[];
  serieCupones: Array<{ intervalo: string; valor: number }>;
  concesionarios: FilaBarra[];
  temperaturaLeads: TramoApilado[];
  puntosDeVenta: FilaBarra[];
  nps: FilaBarra[];
  anexos: FilaBarra[];
  telefonia: { atendidas: number; sinAtender: number; enEspera: number };
}

interface Indicador {
  clave: 'cupones' | 'nps' | 'leads' | 'atencion';
  etiqueta: string;
  valor: number | null;     // null cuando esa fuente no tiene datos cargados
  sufijo?: string;          // '%' en atención telefónica
  apoyo?: string;           // dato secundario ya redactado
}

interface FilaBarra {
  etiqueta: string;
  valor: number;
  detalle?: string;         // texto ya formateado: participación, respuestas, etc.
}

interface TramoApilado {
  etiqueta: 'Súper caliente' | 'Caliente' | 'Tibio' | 'Frío';
  valor: number;
  tono: 'calor-4' | 'calor-3' | 'calor-2' | 'calor-1';   // escala ordinal, de más a menos
}
```

Lo que hay que saber para consumirlo bien:

- **`hayGestion: false` no es un error.** Significa que las planillas de encuestas, leads y
  telefonía todavía no se importaron. En ese caso `nps`, `temperaturaLeads`, `puntosDeVenta` y
  `anexos` vuelven vacíos y los indicadores correspondientes traen `valor: null`. Los cupones
  siguen llegando. Hay que dibujar ese estado, no tratarlo como falla.
- **Un `valor: null` en un indicador es "sin datos", no cero.** Mostrarlo como 0 miente.
- **Las listas ya vienen recortadas y ordenadas** por el servidor: 8 concesionarios, 8
  concesionarios en NPS (solo los que tienen 20 respuestas o más, que es el mínimo para que sea
  comparable), 6 puntos de venta y 6 anexos. No hay paginación ni parámetros para cambiarlo.
- **`detalle` y `apoyo` ya vienen escritos en castellano de Chile**, con coma decimal. Son para
  mostrar tal cual, no para parsear.
- **`serieCupones` es siempre diaria**, un punto por día del período.

## Sesión de personas

Estas rutas son para la aplicación web de WiBot. Una integración con token de servicio **no las
necesita**, y no aceptan `Authorization: Bearer`.

| Ruta | Qué hace |
|---|---|
| `POST /api/sesion` | Inicia sesión con `{ correo, contrasena }` y deja la cookie `wibot_sesion` |
| `DELETE /api/sesion` | Cierra la sesión en curso y borra la cookie |
| `POST /api/sesion/clave` | Cambia la contraseña con `{ actual, nueva }`. Exige la actual |

`POST /api/sesion` responde `{ usuario: { correo, nombre, debeCambiar } }`. Con `debeCambiar:
true` la aplicación tiene que exigir el cambio de clave antes de dejar entrar: es una clave
temporal emitida por un administrador.

Cinco intentos fallidos bloquean quince minutos, contando por correo y por IP por separado; el
bloqueo responde `429`. La respuesta ante credenciales incorrectas es siempre la misma exista o
no la cuenta, para no revelar qué correos están registrados.

## `GET /api/diagnostico`

Registro técnico en memoria: rondas contra el modelo, consultas a la base con su duración y el
cuerpo crudo de los errores.

- Existe **solo con `WIBOT_DEV=1`**. Apagado responde `404`, también para no delatar la ruta.
- Exige cookie de sesión.
- `GET` devuelve `{ eventos: EventoDiagnostico[] }`, del más reciente al más antiguo, con un
  tope de 200. `DELETE` lo vacía.

```ts
interface EventoDiagnostico {
  id: string;
  tipo: 'ronda' | 'herramienta' | 'error' | 'turno';
  titulo: string;
  duracionMs?: number;
  detalle?: unknown;      // argumentos, SQL ejecutado, cuerpo del error
  correo?: string;
  ocurridoEn: string;     // ISO 8601
}
```

**Dejalo apagado en producción**: expone argumentos de consulta y respuestas del modelo.

---

## Integrar desde otro proyecto

### La forma recomendada: proxy en el servidor

Si la página que integra es pública, el token no puede vivir en el navegador. El patrón es un
endpoint propio que reenvía a WiBot:

```ts
// app/api/wibot/tablero/route.ts  (Next.js, del lado del proyecto que integra)
export async function GET(peticion: Request): Promise<Response> {
  const parametros = new URL(peticion.url).searchParams;
  const desde = parametros.get('desde') ?? '';
  const hasta = parametros.get('hasta') ?? '';

  const respuesta = await fetch(
    `${process.env.WIBOT_URL}/api/tablero?desde=${desde}&hasta=${hasta}`,
    { headers: { Authorization: `Bearer ${process.env.WIBOT_TOKEN}` } },
  );

  // El error de WiBot ya viene redactado: se puede reenviar tal cual.
  return Response.json(await respuesta.json(), { status: respuesta.status });
}
```

Así el token nunca sale del servidor, no hace falta configurar orígenes y el proyecto puede
cachear la respuesta del tablero, que es lo que conviene: cambia una vez al día.

### Leer el flujo del chat

El chat llega como NDJSON, así que hay que ir cortando por salto de línea a medida que entra.
Esta función sirve tanto en el navegador como en Node:

```ts
/**
 * Recorre el flujo NDJSON de /api/chat emitiendo un evento por línea.
 *
 * @param pregunta texto de la persona, hasta 2.000 caracteres.
 * @param historial últimos turnos de la conversación, para dar contexto.
 * @throws {Error} si WiBot rechaza la petición antes de empezar a responder.
 */
async function* preguntarleAWibot(
  pregunta: string,
  historial: Array<{ autor: 'persona' | 'wibot'; texto: string }> = [],
): AsyncGenerator<EventoChat> {
  const respuesta = await fetch(`${WIBOT}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN_WIBOT}`,
    },
    body: JSON.stringify({ pregunta, historial }),
  });

  // Un rechazo (401, 403, 400) llega como JSON, antes de que empiece el flujo.
  if (!respuesta.ok || !respuesta.body) {
    const { error } = (await respuesta.json()) as { error?: string };
    throw new Error(error ?? 'WiBot no pudo responder.');
  }

  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = '';

  while (true) {
    const { value, done } = await lector.read();
    if (done) break;

    pendiente += value;
    const lineas = pendiente.split('\n');
    // La última puede estar cortada a la mitad: queda para la vuelta siguiente.
    pendiente = lineas.pop() ?? '';

    for (const linea of lineas) {
      if (linea.trim() === '') continue;
      yield JSON.parse(linea) as EventoChat;
    }
  }
}
```

Y del lado de quien la usa:

```ts
let respuesta = '';

for await (const evento of preguntarleAWibot('¿Cómo viene agosto?')) {
  switch (evento.tipo) {
    case 'consultando':
      mostrarEstado(`Consultando ${evento.herramienta}…`);
      break;
    case 'datos':
      dibujarBloque(evento.formato, evento.resultado);
      break;
    case 'texto':
      respuesta += evento.delta;
      mostrarTexto(respuesta);
      break;
    case 'error':
      mostrarError(evento.mensaje);
      break;
    case 'fin':
      mostrarEstado('');
      break;
  }
}
```

Tres detalles que se pasan por alto y rompen la integración:

1. **La última línea de cada `chunk` puede venir cortada.** Hay que acumular, como arriba.
2. **Un error a mitad de flujo llega como evento, no como estado HTTP.** El `fetch` ya devolvió
   `200`. Si solo se maneja `!respuesta.ok`, esos errores se pierden en silencio.
3. **`fin` llega siempre**, incluso después de un `error`: es el lugar para apagar el indicador
   de carga, no el `catch`.

### Qué se le puede preguntar

WiBot decide solo qué consultar. Estas son las herramientas de las que dispone, y marcan el
límite real de lo que puede responder:

| Herramienta | Qué responde |
|---|---|
| `resumen_operacion` | Volumen y actores distintos de un período |
| `ranking` | Quién lidera por asesor, local, concesionario, familia, modelo, región o comuna |
| `serie_temporal` | Evolución por día, semana o mes |
| `valores_dimension` | Qué valores existen de verdad en la base |
| `buscar_cliente` | Ficha e historial de un cliente puntual |
| `historial_vehiculo` | Atenciones de una patente o un VIN |
| `encuestas_posventa` | Satisfacción y NPS por concesionario, sucursal o mes |
| `leads` · `buscar_lead` | Leads por temperatura, punto de venta, modelo, vendedor o estado |
| `llamadas` · `buscar_llamadas` | Volumen, tasa de atención y minutos del contact center |
| `anexos_telefonia` | Acumulado por anexo o agente |
| `consulta_sql` | `SELECT` a medida, validado, contra cualquiera de las dos bases |
| `esquema_cupones` · `esquema_gestion` | Diccionario de cada base |

Qué hay cargado: 87.441 cupones de servicio desde el 18-03-2025, de 19 concesionarios, 52
locales y 546 asesores, sobre 46.755 clientes y sus vehículos MG. La base de gestión suma
encuestas de posventa (marzo 2025 a septiembre 2026), leads y telefonía **solo de agosto de
2026**: preguntas fuera de ese rango sobre leads o llamadas vuelven vacías.

### Límites y garantías

- **Solo lectura.** Toda sentencia pasa por un validador que rechaza escrituras, sentencias
  múltiples, `INTO OUTFILE`, `LOAD_FILE` y los esquemas del sistema, y fuerza un `LIMIT`. No hay
  forma de modificar datos por la API.
- **12 rondas de consulta** como máximo por pregunta (`WIBOT_MAX_RONDAS`). Después el modelo
  tiene que cerrar con lo que tenga.
- **Cada consulta a la base corta a los 15 segundos** (`QUERY_TIMEOUT_MS`) y devuelve como
  máximo 500 filas (`QUERY_ROW_LIMIT`). Cuando se alcanza el tope, `truncado` viene en `true`.
- **La API no tiene timeout propio ni reintenta.** Una pregunta compleja puede encadenar varias
  consultas y tardar decenas de segundos: si hay un proxy o un balanceador en el medio, revisá
  que no corte el flujo, y que no ponga buffer, o el streaming deja de serlo. WiBot manda
  `X-Accel-Buffering: no` para pedírselo a nginx.
- **Sin versionado de API.** Los cambios de forma se anuncian en el repo; no hay `/v1`.
