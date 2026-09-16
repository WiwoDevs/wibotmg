import 'server-only';
import { hoyLocal, herramientasComoJsonSchema, obtenerHerramienta } from '@wibot/core';
import type { EventoChat, TurnoEnviado } from './tipos';

const MAX_RONDAS_DE_HERRAMIENTAS = 6;

interface LlamadaHerramienta {
  id: string;
  nombre: string;
  argumentos: string;
  extra?: unknown;
}

interface MensajeModelo {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
    extra_content?: unknown;
  }>;
  tool_call_id?: string;
}

interface ConfiguracionModelo {
  apiKey: string;
  baseUrl: string;
  modelo: string;
}

/**
 * Lee la configuración del modelo desde el entorno.
 * @throws {Error} si falta la clave de API.
 */
function obtenerConfiguracionModelo(): ConfiguracionModelo {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Falta GEMINI_API_KEY en el entorno. WiBot no puede responder sin modelo.');
  }
  return {
    apiKey,
    baseUrl: (process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
    modelo: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash',
  };
}

/** Construye la instrucción de sistema, con la fecha de hoy ya resuelta. */
function construirInstruccionDeSistema(): string {
  return `Sos WiBot, la inteligencia ejecutiva de WIWO sobre la operación de cupones de servicio de MG Contact en Chile.

Hoy es ${hoyLocal()}.

Qué hay en la base: un registro por cupón de servicio emitido, con concesionario, sucursal, asesor, vehículo (VIN, patente, modelo) y cliente. Cubre desde marzo de 2025.

Cómo trabajás:
- Consultá la base antes de dar cualquier cifra. No estimes, no recuerdes, no interpoles.
- Para volúmenes usá resumen_operacion; para "quién lidera" usá ranking; para tendencias, serie_temporal.
- Antes de filtrar por un nombre que no estás seguro de que exista, confirmalo con valores_dimension.
- consulta_sql es el último recurso; antes mirá esquema_cupones.
- Si una pregunta necesita varias consultas, hacelas todas antes de responder.

Cómo respondés:
- En español rioplatense neutro, directo, sin preámbulos ni disculpas.
- Dos o tres frases. La cifra primero, después lo que la explica.
- Siempre decí a qué período corresponde el número.
- No repitas en texto la tabla que ya se muestra abajo: comentá lo que importa de ella.
- Si el dato está sucio o incompleto, decilo con todas las letras.
- Si la base no tiene con qué responder, decí qué falta en vez de inventar.
- Los datos personales vienen enmascarados salvo en búsquedas puntuales. No intentes rodear eso.`;
}

/** Traduce el registro de herramientas al formato de la API compatible con OpenAI. */
function construirHerramientas() {
  return herramientasComoJsonSchema().map((herramienta) => ({
    type: 'function' as const,
    function: {
      name: herramienta.nombre,
      description: herramienta.descripcion,
      parameters: herramienta.parametros,
    },
  }));
}

/** Parsea los argumentos JSON de una llamada a herramienta sin romper el turno. */
function parsearArgumentos(bruto: string): Record<string, unknown> {
  if (!bruto || bruto.trim() === '') return {};
  try {
    const valor: unknown = JSON.parse(bruto);
    return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface RondaStream {
  texto: string;
  llamadas: LlamadaHerramienta[];
}

/**
 * Ejecuta una ronda contra el modelo en modo streaming, emitiendo el texto
 * a medida que llega y acumulando las llamadas a herramientas.
 *
 * @param configuracion credenciales y modelo.
 * @param mensajes historial completo enviado al modelo.
 * @param alRecibirTexto se invoca con cada fragmento de texto.
 * @throws {Error} si la API responde con un código de error.
 */
async function ejecutarRonda(
  configuracion: ConfiguracionModelo,
  mensajes: MensajeModelo[],
  alRecibirTexto: (delta: string) => void,
): Promise<RondaStream> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${configuracion.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${configuracion.apiKey}`,
      },
      body: JSON.stringify({
        model: configuracion.modelo,
        messages: mensajes,
        tools: construirHerramientas(),
        tool_choice: 'auto',
        stream: true,
        max_tokens: 2048,
        reasoning_effort: 'low',
      }),
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo alcanzar el modelo (${detalle}). Revisá la conexión y volvé a preguntar.`);
  }

  if (!respuesta.ok || !respuesta.body) {
    const detalle = await respuesta.text().catch(() => '');
    const explicacion =
      respuesta.status === 401 || respuesta.status === 403
        ? 'La clave del modelo fue rechazada.'
        : respuesta.status === 429
          ? 'El modelo está saturado de pedidos. Esperá unos segundos y volvé a preguntar.'
          : `El modelo respondió ${respuesta.status}.`;
    throw new Error(`${explicacion} ${detalle.slice(0, 200)}`.trim());
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  const acumuladas = new Map<number, LlamadaHerramienta>();
  let texto = '';
  let pendiente = '';

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true });

    const lineas = pendiente.split('\n');
    pendiente = lineas.pop() ?? '';

    for (const linea of lineas) {
      const limpia = linea.trim();
      if (!limpia.startsWith('data:')) continue;
      const carga = limpia.slice(5).trim();
      if (carga === '' || carga === '[DONE]') continue;

      let evento: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
              extra_content?: unknown;
            }>;
          };
        }>;
      };
      try {
        evento = JSON.parse(carga);
      } catch {
        continue;
      }

      const delta = evento.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content !== '') {
        texto += delta.content;
        alRecibirTexto(delta.content);
      }

      for (const [posicion, llamada] of (delta.tool_calls ?? []).entries()) {
        const indice = llamada.index ?? posicion;
        const previa = acumuladas.get(indice) ?? { id: '', nombre: '', argumentos: '' };
        acumuladas.set(indice, {
          id: llamada.id ?? previa.id,
          nombre: llamada.function?.name ?? previa.nombre,
          argumentos: previa.argumentos + (llamada.function?.arguments ?? ''),
          extra: llamada.extra_content ?? previa.extra,
        });
      }
    }
  }

  return { texto, llamadas: [...acumuladas.values()].filter((llamada) => llamada.nombre !== '') };
}

/**
 * Conduce un turno completo de conversación: rondas de consulta a la base
 * hasta que el modelo tenga con qué responder, y luego la respuesta en texto.
 *
 * @param historial turnos previos de la conversación, del más antiguo al más reciente.
 * @param pregunta lo que acaba de escribir la persona.
 * @yields eventos de progreso, datos y texto para la interfaz.
 */
export async function* conversar(
  historial: TurnoEnviado[],
  pregunta: string,
): AsyncGenerator<EventoChat> {
  const configuracion = obtenerConfiguracionModelo();

  const mensajes: MensajeModelo[] = [
    { role: 'system', content: construirInstruccionDeSistema() },
    ...historial.map((turno): MensajeModelo => ({
      role: turno.autor === 'persona' ? 'user' : 'assistant',
      content: turno.texto,
    })),
    { role: 'user', content: pregunta },
  ];

  for (let ronda = 0; ronda < MAX_RONDAS_DE_HERRAMIENTAS; ronda += 1) {
    const pendientes: EventoChat[] = [];
    const ejecutada = await ejecutarRonda(configuracion, mensajes, (delta) => {
      pendientes.push({ tipo: 'texto', delta });
    });

    for (const evento of pendientes) yield evento;

    if (ejecutada.llamadas.length === 0) {
      if (ejecutada.texto.trim() === '') {
        yield {
          tipo: 'error',
          mensaje: 'El modelo no devolvió respuesta. Probá reformular la pregunta.',
        };
      }
      yield { tipo: 'fin' };
      return;
    }

    mensajes.push({
      role: 'assistant',
      content: ejecutada.texto === '' ? null : ejecutada.texto,
      tool_calls: ejecutada.llamadas.map((llamada) => ({
        id: llamada.id,
        type: 'function' as const,
        function: { name: llamada.nombre, arguments: llamada.argumentos || '{}' },
        ...(llamada.extra ? { extra_content: llamada.extra } : {}),
      })),
    });

    for (const llamada of ejecutada.llamadas) {
      const argumentos = parsearArgumentos(llamada.argumentos);
      yield { tipo: 'consultando', herramienta: llamada.nombre, argumentos };

      const herramienta = obtenerHerramienta(llamada.nombre);
      if (!herramienta) {
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: `La herramienta "${llamada.nombre}" no existe.`,
        });
        continue;
      }

      try {
        const resultado = await herramienta.ejecutar(argumentos);
        yield { tipo: 'datos', herramienta: llamada.nombre, formato: herramienta.formato, resultado };
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: JSON.stringify(resultado),
        });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: `Error: ${mensaje}` });
      }
    }
  }

  yield {
    tipo: 'error',
    mensaje: 'La consulta necesitó demasiados pasos. Probá acotar la pregunta a un período o a un concesionario.',
  };
  yield { tipo: 'fin' };
}
