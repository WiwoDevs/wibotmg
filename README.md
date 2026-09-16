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
npm run build            # compila core y MCP
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

## Chat web

```bash
npm run dev              # desarrollo en http://localhost:3100
npm run build -w @wibot/web && npm run start -w @wibot/web
```

La clave de Gemini vive solo en el servidor: el navegador nunca la ve.

## Servidor MCP

Con `.mcp.json` en la raíz, Claude Code lo detecta al abrir el proyecto. Para registrarlo a mano:

```bash
claude mcp add wibot -- node /ruta/a/mgcontactbot/packages/mcp/dist/servidor.js
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
| `consulta_sql` | SELECT a medida, validado |
| `esquema_cupones` | Diccionario de la tabla principal |
| `listar_tablas` · `describir_tabla` | Estructura de la base |

## Seguridad

- **Solo lectura.** Cada sentencia pasa por `validarSelect`: rechaza sentencias múltiples,
  cualquier verbo de escritura o administración, `INTO OUTFILE`, `LOAD_FILE`, los esquemas
  del sistema y las tablas que no existen. Además fuerza un `LIMIT`.
- **Privacidad.** `PII_MODE` controla los datos personales:
  `aggregate` (por defecto) los enmascara salvo en `buscar_cliente` e `historial_vehiculo`,
  `masked` los enmascara siempre, `full` no restringe nada.
- **Secretos.** Solo en `.env`, que está en `.gitignore`. Nada de claves en el código.

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
packages/mcp    Servidor MCP sobre stdio
apps/web        Chat WiBot en Next.js
scripts         MariaDB local sin root
PRODUCT.md      Qué es WiBot y para quién
DESIGN.md       Sistema visual
```
