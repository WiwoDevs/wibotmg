#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { cerrarPool, obtenerConfiguracion } from '@wibot/core';
import { registrarHerramientas } from './herramientas.js';

const INSTRUCCIONES = `WiBot consulta la base de cupones de servicio de MG Contact (concesionarios MG en Chile).

La tabla de negocio es coupon_file_data: un registro por cupón de servicio emitido, con
concesionario, sucursal, asesor, vehículo (VIN, patente, modelo) y cliente.

Cómo trabajar:
1. Para volúmenes y KPIs usá resumen_operacion; para "quién lidera" usá ranking; para tendencias, serie_temporal.
2. Antes de filtrar por un nombre, confirmá que existe con valores_dimension.
3. Recurrí a consulta_sql solo cuando lo anterior no alcance, y mirá antes esquema_cupones.
4. Los datos personales (RUT, teléfono, correo, dirección) se enmascaran salvo en búsquedas puntuales
   con buscar_cliente o historial_vehiculo. No intentes rodear eso con SQL.
5. Siempre decí a qué período corresponde el número que entregás.`;

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
