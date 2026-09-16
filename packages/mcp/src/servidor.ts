#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { cerrarPool, obtenerConfiguracion } from '@wibot/core';
import { registrarHerramientas } from './herramientas.js';

const INSTRUCCIONES = `WiBot consulta los datos de MG Contact (concesionarios MG en Chile). Hay dos fuentes.

1. Cupones de servicio (MariaDB, tabla coupon_file_data): un registro por cupón emitido, con
   concesionario, sucursal, asesor, vehículo (VIN, patente, modelo) y cliente. Desde marzo de 2025.
   Herramientas: resumen_operacion, ranking, serie_temporal, valores_dimension, buscar_cliente,
   historial_vehiculo, esquema_cupones, listar_tablas, describir_tabla.

2. Gestión (SQLite, importado de planillas): encuestas de posventa con notas de 1 a 7, leads del
   CRM con su temperatura, registro telefónico y estadísticas por anexo.
   Herramientas: encuestas_posventa, leads, buscar_lead, llamadas, buscar_llamadas,
   anexos_telefonia, esquema_gestion.

Cómo trabajar:
1. Elegí la fuente por el tema: cupones para volumen de servicio; encuestas para satisfacción y NPS;
   leads para lo comercial; llamadas para el contact center.
2. Antes de filtrar por un nombre, confirmá que existe con valores_dimension.
3. Recurrí a consulta_sql solo cuando lo anterior no alcance, indicando la fuente ("cupones" o
   "gestion"), y mirá antes el esquema correspondiente.
4. Los datos personales se enmascaran salvo en búsquedas puntuales con buscar_cliente,
   historial_vehiculo, buscar_lead o buscar_llamadas. No intentes rodear eso con SQL.
5. Siempre decí a qué período corresponde el número que entregás. Los leads del informe actual son
   solo de agosto de 2026 y las llamadas solo de agosto de 2026: no los presentes como histórico.`;

/**
 * Levanta el servidor MCP de WiBot sobre stdio.
 * Valida la configuración antes de aceptar conexiones para fallar temprano
 * y con un mensaje claro si falta el .env.
 */
async function principal(): Promise<void> {
  const configuracion = obtenerConfiguracion();

  const servidor = new McpServer(
    { name: 'wibot', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCCIONES },
  );

  registrarHerramientas(servidor);

  const transporte = new StdioServerTransport();
  await servidor.connect(transporte);

  process.stderr.write(
    `WiBot MCP listo · base ${configuracion.db.database} · privacidad ${configuracion.modoPrivacidad}\n`,
  );

  const apagar = async (): Promise<void> => {
    await cerrarPool();
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
}

principal().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  process.stderr.write(`WiBot MCP no pudo arrancar: ${mensaje}\n`);
  process.exit(1);
});
