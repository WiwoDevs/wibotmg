import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HERRAMIENTAS, SqlRechazadoError } from '@wibot/core';

/** Empaqueta cualquier resultado como contenido de texto JSON para el cliente MCP. */
function responder(datos: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(datos, null, 2) }] };
}

/** Empaqueta un error de negocio sin tumbar la sesión MCP. */
function responderError(error: unknown) {
  const mensaje =
    error instanceof SqlRechazadoError
      ? `${error.message}. Reescribí la consulta como un SELECT de solo lectura.`
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: 'text' as const, text: mensaje }], isError: true };
}

/**
 * Registra en el servidor MCP el registro compartido de herramientas de WiBot.
 * Todas son de solo lectura y respetan la política de privacidad configurada.
 *
 * @param servidor instancia de McpServer sobre la que se registran las herramientas.
 */
export function registrarHerramientas(servidor: McpServer): void {
  const soloLectura = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

  for (const herramienta of HERRAMIENTAS) {
    servidor.registerTool(
      herramienta.nombre,
      {
        title: herramienta.titulo,
        description: herramienta.descripcion,
        inputSchema: herramienta.esquema,
        annotations: soloLectura,
      },
      async (argumentos: Record<string, unknown>) => {
        try {
          return responder(await herramienta.ejecutar(argumentos ?? {}));
        } catch (error) {
          return responderError(error);
        }
      },
    );
  }
}
