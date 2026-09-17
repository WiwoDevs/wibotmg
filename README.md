# WiBot

Conversación en castellano sobre la base de cupones de servicio de MG Contact.
Dos superficies sobre una misma capa de consulta:

- **Servidor MCP** (`packages/mcp`): conectable a Claude Code, Claude Desktop o cualquier cliente MCP.
- **Chat web** (`apps/web`): la interfaz de WiBot, que habla con Gemini y consulta la base por vos.

Las dos comparten `packages/core`, que es lo único que toca la base de datos.

## Puesta en marcha

```bash
npm install
cp .env.example .env     # completar credenciales
npm run build            # compila core, auth y MCP
```

### Base de datos local (desde el dump)

El repositorio trae un MariaDB propio bajo `.data/`, sin necesidad de root ni de systemd:

```bash
npm run db:start         # levanta MariaDB en 127.0.0.1:3307
npm run db:import        # importa el .sql.gz más reciente de la raíz
npm run db:stop
bash scripts/db-local.sh shell   # consola SQL de solo lectura
```

El usuario `wibot` tiene únicamente permiso `SELECT`; `wibot_admin` existe solo para importar.

### Base de datos de producción

`cupones.mgcontact.cl` no expone el 3306 hacia afuera. Abrí un túnel y apuntá el `.env` ahí:

```bash
ssh -N -L 3307:localhost:3306 usuario@cupones.mgcontact.cl
```

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=mgcontact_wp_lul6u
DB_USER=mgcontact_wp_9kfvm
DB_PASSWORD=...
```

Conviene crear en el servidor un usuario de MySQL con permiso `SELECT` exclusivamente sobre
esa base, en vez de usar el usuario de WordPress.

## Quién puede entrar

WiBot no es público: sin sesión, cualquier ruta redirige a `/entrar` y la API responde 401.
La única excepción es un token de servicio válido, para que otra página consuma la API
(ver "Que otra página consuma WiBot").
Las cuentas viven en un SQLite propio (`.data/wibot.sqlite`), separado de la base de MG Contact,
que también guarda las sesiones y la auditoría.

```bash
npm run usuarios -- crear correo@wiwo.me "Nombre Apellido"   # alta, devuelve clave temporal
npm run usuarios -- listar                                   # quién tiene acceso y cuándo entró
npm run usuarios -- clave correo@wiwo.me                     # nueva clave temporal
npm run usuarios -- desactivar correo@wiwo.me                # baja: cierra todas sus sesiones
npm run usuarios -- activar correo@wiwo.me
npm run usuarios -- auditoria 20                             # últimas consultas, con quién las hizo
```

La primera cuenta hay que crearla desde el servidor: mientras no exista ninguna, la pantalla de
entrada lo dice en vez de mostrar un formulario contra el que nadie puede entrar.

Cómo está protegido:

- **Contraseñas** derivadas con scrypt (N=2^15) y sal propia. En la base nunca hay una contraseña.
- **Clave temporal obligatoria.** El alta y todo reseteo hecho por un administrador obligan a
  cambiarla en el primer acceso.
- **Sesiones** con token de 32 bytes en cookie `httpOnly`, `SameSite=Lax`; en la base solo queda
  su SHA-256, así que un volcado del SQLite no permite suplantar a nadie. Duran
  `WIBOT_SESSION_HOURS` (12 por defecto) y las vencidas se purgan solas.
- **Fuerza bruta:** cinco intentos fallidos bloquean quince minutos, contando por correo y por IP
  por separado. La respuesta es la misma exista o no la cuenta, para no revelar qué correos están
  registrados.
- **Auditoría:** cada pregunta queda registrada con usuario, IP, fecha y herramientas usadas, y
  marcada aparte si tocó datos personales.
- **Cookie segura:** poné `WIBOT_COOKIE_SEGURA=1` al servir por HTTPS.

Al servir WiBot fuera de `localhost`, ponelo detrás de HTTPS: la cookie de sesión y las
contraseñas viajan en cada petición.

## Que otra página consuma WiBot

> Referencia completa de la API, para integrarla desde otro proyecto: [`docs/API.md`](docs/API.md).

Además de la sesión por cookie, la API acepta **tokens de servicio**: así otra página puede
llamar al chat y al tablero sin que haya nadie con sesión abierta. Los tokens viven en el mismo
SQLite que los usuarios y se administran por consola:

```bash
npm run tokens -- crear <nombre> [origen...]   # alta; muestra el token una sola vez
npm run tokens -- listar                       # estado y último uso de cada token
npm run tokens -- revocar <nombre>             # lo deja fuera de servicio en el acto
```

Los orígenes son las páginas que van a llamar **desde el navegador**, con esquema y puerto:
`https://sitio.cl`. Un token sin orígenes solo sirve de servidor a servidor.

```bash
npm run tokens -- crear sitio-mg https://mgcontact.cl
```

El token se manda en cada petición:

```bash
curl -H "Authorization: Bearer wibot_..." \
  "https://wibot.tu-dominio.cl/api/tablero?desde=2026-08-01&hasta=2026-08-31"
```

Desde el navegador de la otra página, igual: el preflight se resuelve solo si el origen figura
en algún token activo.

```js
const respuesta = await fetch(`${WIBOT}/api/tablero?desde=${desde}&hasta=${hasta}`, {
  headers: { Authorization: `Bearer ${TOKEN_WIBOT}` },
});
const tablero = await respuesta.json();
```

El chat responde un flujo NDJSON: un evento JSON por línea, con los tipos `consultando`, `datos`,
`texto`, `error` y `fin`.

```js
const respuesta = await fetch(`${WIBOT}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN_WIBOT}` },
  body: JSON.stringify({ pregunta: '¿Cómo viene agosto?', historial: [] }),
});
for await (const linea of lineasDe(respuesta.body)) {
  const evento = JSON.parse(linea);
  if (evento.tipo === 'texto') mostrar(evento.delta);
}
```

Qué tener en cuenta:

- **El token es la credencial completa.** Nunca lo pongas en el JavaScript del navegador de una
  página pública: cualquiera que abra el inspector se lo lleva. Si la otra página es pública,
  que el token viva en su servidor y sea él quien llame a WiBot.
- **La lista de orígenes no es una barrera de seguridad**, es la condición que el navegador exige.
  Una petición hecha con `curl` no manda `Origin` y pasa igual: lo que la autoriza es el token.
- **Un token entra a todo**: `/api/chat` y `/api/tablero`. No hay permisos por endpoint.
- **Todo queda auditado** igual que una consulta de persona, con `token:<nombre>` en vez del correo
  (`npm run usuarios -- auditoria`).
- **Revocar es inmediato** y no borra el historial: el token queda inactivo y la auditoría anterior
  sigue apuntando a su nombre.
- **No hay límite de frecuencia por token.** Si la otra página va a llamar seguido, cacheá del lado
  de ella: cada consulta al chat es una llamada a Gemini.

## Chat web

```bash
npm run dev              # desarrollo en http://localhost:3100
npm run build -w @wibot/web && npm run start -w @wibot/web
```

La clave de Gemini vive solo en el servidor: el navegador nunca la ve.

## Base de gestión: encuestas, leads y telefonía

Además de los cupones, WiBot lee un SQLite propio con lo que llega en planillas. Los Excel se dejan
en `data/` y se importan con:

```bash
npm run datos:importar
```

El comando recrea cada tabla desde cero, así que se puede repetir cuando lleguen archivos nuevos sin
duplicar filas. Reconoce los archivos por su nombre, no por su ruta exacta:

| Archivo que busca | Tabla | Qué trae |
|---|---|---|
| `*Encuestas PosVenta*.xlsx` | `encuestas` | Respuestas de posventa, una hoja por mes, notas de 1 a 7 |
| `*stats_delivered*.xlsx` | `encuestas_envios` | A quién se le mandó la encuesta y si la abrió |
| `*Leads*.xlsx` | `leads` | Leads del CRM con su temperatura y punto de venta |
| `call_reports.xlsx` | `llamadas` | Registro de la central telefónica |
| `extension_statistics*.xlsx` | `anexos` | Acumulado por anexo o agente |

**`data/` está en `.gitignore`**: esas planillas traen RUT, teléfonos y correos de clientes reales,
y el SQLite que generan vive en `.data/`, que tampoco se publica.

Particularidades del origen que el importador resuelve, y conviene conocer:

- El informe de leads viene agrupado: la fecha, el origen y el estado solo aparecen en la primera
  fila de cada grupo, con un conteo pegado al valor. Se arrastran hacia abajo y se limpia el conteo.
- Las duraciones de telefonía llegan como fecha serial de Excel (`1 day, 7:02:10`), no como texto.
- Tanto `call_reports` como el informe de anexos cierran con una fila de totales que se descarta.
- La columna "Mes de encuesta" trae el mes sin año, así que el período sale del nombre de la hoja.
- El mismo concesionario aparece como `Forcenter` y `FORCENTER`: se agrupan juntos al consultar.
- La columna de sentimiento viene vacía en los datos actuales, tanto en llamadas como en anexos.

Qué hay cargado hoy: 3.082 encuestas (marzo 2025 a septiembre 2026), 645 envíos, 2.000 leads
(solo agosto de 2026), 12.665 tramos de llamada (solo agosto de 2026) y 15 anexos.

## Modo diagnóstico

Con `WIBOT_DEV=1` aparece un registro técnico: cada ronda contra el modelo, cada consulta a la
base con su duración, y el cuerpo crudo de los errores. Se abre con el botón del pulso en la
cabecera del chat, y también se puede leer entero en `GET /api/diagnostico`.

Apagado (`WIBOT_DEV=0`, el valor por defecto) no se guarda nada y la ruta responde 404. Dejalo
apagado en producción: expone argumentos de consulta y respuestas del modelo.

El botón de la hoja, al lado, vacía la conversación en curso. Pide confirmación con un segundo
clic y no toca la auditoría: lo que se preguntó queda registrado igual.

## Servidor MCP

Con `.mcp.json` en la raíz, Claude Code lo detecta al abrir el proyecto. Para registrarlo a mano,
o para Claude Desktop, usá la ruta absoluta:

```bash
claude mcp add wibot -- node /ruta/a/mgcontactbot/packages/mcp/dist/servidor.js
```

El servidor ubica su `.env` y sus bases a partir de dónde está instalado, no del directorio desde
el que lo arranquen, así que funciona igual lo lance quien lo lance.

**Después de tocar el código hay que recompilar y reiniciar el cliente MCP**: los clientes levantan
el proceso una sola vez y se quedan con las herramientas que vieron al conectar.

```bash
npm run build     # recompila core, auth y MCP
```

Herramientas expuestas:

| Herramienta | Qué responde |
|---|---|
| `resumen_operacion` | Volumen y actores distintos de un período |
| `ranking` | Quién lidera por asesor, local, concesionario, familia, modelo, región o comuna |
| `serie_temporal` | Evolución por día, semana o mes |
| `valores_dimension` | Qué valores existen de verdad en la base |
| `buscar_cliente` | Ficha e historial de un cliente puntual |
| `historial_vehiculo` | Atenciones de una patente o un VIN |
| `encuestas_posventa` | Satisfacción y NPS por concesionario, sucursal o mes |
| `leads` | Leads por temperatura, punto de venta, modelo, vendedor o estado |
| `buscar_lead` | Ficha y seguimiento de un lead puntual |
| `llamadas` | Volumen, tasa de atención y minutos del contact center |
| `buscar_llamadas` | Llamadas por número o por texto del resumen |
| `anexos_telefonia` | Acumulado por anexo o agente |
| `consulta_sql` | SELECT a medida, validado, contra cualquiera de las dos bases |
| `esquema_cupones` · `esquema_gestion` | Diccionario de cada base |
| `listar_tablas` · `describir_tabla` | Estructura de la base de cupones |

## Seguridad

- **Solo lectura.** Cada sentencia pasa por `validarSelect`: rechaza sentencias múltiples,
  cualquier verbo de escritura o administración, `INTO OUTFILE`, `LOAD_FILE`, los esquemas
  del sistema y las tablas que no existen. Además fuerza un `LIMIT`.
- **Privacidad.** `PII_MODE` controla los datos personales:
  `aggregate` (por defecto) los enmascara salvo en `buscar_cliente` e `historial_vehiculo`,
  `masked` los enmascara siempre, `full` no restringe nada.
- **Secretos.** Solo en `.env`, que está en `.gitignore`. Nada de claves en el código.
- **Acceso.** Ver la sección "Quién puede entrar": sesión obligatoria, contraseñas con scrypt,
  bloqueo por fuerza bruta y auditoría de cada consulta.

## Qué hay en la base

87.441 cupones de servicio desde el 18-03-2025, de 19 concesionarios, 52 locales y 546 asesores,
sobre 46.755 clientes y sus vehículos MG. El resto de las tablas es infraestructura de WordPress
y WooCommerce sin datos de negocio.

Datos sucios conocidos, ya normalizados en `packages/core/src/catalogo.ts`:
`Familia` mezcla `MG_ZS` con `MG ZS`; `TipoEvento` trae correos y entidades HTML;
hay filas con `NombreConcesionario` vacío.

## Estructura

```
packages/core   Configuración, pool, guardia SQL, privacidad, consultas y registro de herramientas
scripts         MariaDB local sin root e importación de los Excel a SQLite
packages/auth   Usuarios, sesiones, límite de intentos y auditoría sobre SQLite
packages/mcp    Servidor MCP sobre stdio
apps/web        Chat WiBot en Next.js, con pantalla de entrada
PRODUCT.md      Qué es WiBot y para quién
DESIGN.md       Sistema visual
```
