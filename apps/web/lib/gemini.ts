import 'server-only';
import { hoyLocal, herramientasComoJsonSchema, obtenerHerramienta } from '@wibot/core';
import { esModoDiagnostico, recortar, registrarEvento } from './diagnostico';
import type { EventoChat, TurnoEnviado } from './tipos';

/** Rondas de consulta permitidas antes de exigirle al modelo que cierre. */
const MAX_RONDAS_DE_HERRAMIENTAS = Number.parseInt(process.env.WIBOT_MAX_RONDAS ?? '', 10) || 12;

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

Tenés dos fuentes:

1. Cupones de servicio: un registro por cupón emitido, con concesionario, sucursal, asesor, vehículo (VIN, patente, modelo) y cliente. Desde marzo de 2025. Herramientas: resumen_operacion, ranking, serie_temporal, valores_dimension, buscar_cliente, historial_vehiculo.

2. Gestión: encuestas de posventa con notas de 1 a 7 y NPS, leads del CRM con su temperatura (Super Caliente, Caliente, Tibio, Frío), registro telefónico y estadísticas por anexo. Herramientas: encuestas_posventa, leads, buscar_lead, llamadas, buscar_llamadas, anexos_telefonia.

Cómo trabajás:
- Consultá la base antes de dar cualquier cifra. No estimes, no recuerdes, no interpoles.
- Elegí la fuente por el tema: cupones para volumen de servicio, encuestas para satisfacción, leads para lo comercial, llamadas para el contact center.
- Antes de filtrar por un nombre que no estás seguro de que exista, confirmalo con valores_dimension.
- consulta_sql es el último recurso; indicá la fuente y mirá antes esquema_cupones o esquema_gestion.
- No uses listar_tablas ni describir_tabla salvo que alguien pregunte por la estructura de la base: son tablas de WordPress que no aportan al negocio y gastan pasos.
- Si te piden varios bloques en una sola pregunta, pedí todas las consultas que puedas en la misma tanda en vez de una por vez.
- Si una pregunta necesita varias consultas, hacelas todas antes de responder.
- El NPS es un índice de -100 a 100, no un porcentaje: decí "NPS 61", nunca "61%".
- Los leads y las llamadas que hay cargados son solo de agosto de 2026: no los presentes como histórico ni los compares con meses que no existen.

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

interface ArgumentosParseados {
  argumentos: Record<string, unknown>;
  /** Mensaje de error cuando el modelo mandó un JSON que no se puede leer. */
  problema?: string;
}

/**
 * Parsea los argumentos JSON de una llamada a herramienta.
 * Un JSON roto se informa en vez de convertirse en un objeto vacío: ejecutar
 * la consulta con los parámetros por defecto daría una cifra que nadie pidió.
 *
 * @param bruto cadena JSON tal como la mandó el modelo.
 */
function parsearArgumentos(bruto: string): ArgumentosParseados {
  if (!bruto || bruto.trim() === '') return { argumentos: {} };
  try {
    const valor: unknown = JSON.parse(bruto);
    if (typeof valor === 'object' && valor !== null && !Array.isArray(valor)) {
      return { argumentos: valor as Record<string, unknown> };
    }
    return { argumentos: {}, problema: 'Los argumentos no son un objeto JSON.' };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { argumentos: {}, problema: `Los argumentos no son JSON válido: ${detalle}` };
  }
}

interface FragmentoLlamada {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
  extra_content?: unknown;
}

/**
 * Decide a qué llamada pertenece un fragmento del stream.
 *
 * La API de OpenAI numera los fragmentos con `index` y parte los argumentos en
 * varios trozos. Gemini, en cambio, manda cada llamada completa en su propio
 * fragmento, con `id` y sin `index`: agruparlas por posición las fusionaría en
 * una sola llamada con los argumentos de dos herramientas pegados.
 *
 * @param fragmento trozo recibido en el delta.
 * @param ultima clave usada en el fragmento anterior, para las continuaciones
 *   que no traen ni `index` ni `id`.
 */
function claveDeLlamada(fragmento: FragmentoLlamada, ultima: string | undefined): string {
  if (typeof fragmento.index === 'number') return `indice:${fragmento.index}`;
  if (fragmento.id) return `id:${fragmento.id}`;
  return ultima ?? 'indice:0';
}

interface RondaStream {
  texto: string;
  llamadas: LlamadaHerramienta[];
  duracionMs: number;
  mensajesEnviados: number;
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
  sinHerramientas = false,
): Promise<RondaStream> {
  const comenzoEn = Date.now();
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
        ...(sinHerramientas
          ? {}
          : { tools: construirHerramientas(), tool_choice: 'auto' }),
        stream: true,
        max_tokens: 2048,
        reasoning_effort: 'low',
      }),
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    registrarEvento({
      tipo: 'error',
      titulo: 'No se pudo alcanzar el modelo',
      duracionMs: Date.now() - comenzoEn,
      detalle: { url: `${configuracion.baseUrl}/chat/completions`, error: detalle },
    });
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
    registrarEvento({
      tipo: 'error',
      titulo: `El modelo respondió ${respuesta.status}`,
      duracionMs: Date.now() - comenzoEn,
      detalle: {
        estado: respuesta.status,
        cuerpo: recortar(detalle, 2000),
        modelo: configuracion.modelo,
        mensajesEnviados: mensajes.length,
        ultimoMensaje: recortar(mensajes[mensajes.length - 1], 600),
      },
    });
    throw new Error(`${explicacion} ${detalle.slice(0, 200)}`.trim());
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  const acumuladas = new Map<string, LlamadaHerramienta>();
  let ultimaClave: string | undefined;
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

      for (const llamada of delta.tool_calls ?? []) {
        const clave = claveDeLlamada(llamada, ultimaClave);
        ultimaClave = clave;
        const previa = acumuladas.get(clave) ?? { id: '', nombre: '', argumentos: '' };
        acumuladas.set(clave, {
          id: llamada.id ?? previa.id,
          nombre: llamada.function?.name ?? previa.nombre,
          argumentos: previa.argumentos + (llamada.function?.arguments ?? ''),
          extra: llamada.extra_content ?? previa.extra,
        });
      }
    }
  }

  const llamadas = [...acumuladas.values()].filter((llamada) => llamada.nombre !== '');

  return { texto, llamadas, duracionMs: Date.now() - comenzoEn, mensajesEnviados: mensajes.length };
}

/**
 * Anota un evento de diagnóstico y, si el modo está activo, lo manda también
 * al navegador para que aparezca en el panel en vivo.
 */
function* emitirDiagnostico(
  evento: Parameters<typeof registrarEvento>[0],
): Generator<EventoChat> {
  const registrado = registrarEvento(evento);
  if (esModoDiagnostico()) {
    yield {
      tipo: 'diagnostico',
      evento: {
        id: registrado.id,
        tipo: registrado.tipo,
        titulo: registrado.titulo,
        ocurridoEn: registrado.ocurridoEn,
        ...(registrado.duracionMs === undefined ? {} : { duracionMs: registrado.duracionMs }),
        ...(registrado.detalle === undefined ? {} : { detalle: registrado.detalle }),
      },
    };
  }
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
    let ejecutada: RondaStream;
    try {
      ejecutada = await ejecutarRonda(configuracion, mensajes, (delta) => {
        pendientes.push({ tipo: 'texto', delta });
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      yield* emitirDiagnostico({
        tipo: 'error',
        titulo: `La ronda ${ronda + 1} falló`,
        detalle: { error: mensaje, mensajesEnviados: mensajes.length },
      });
      throw error;
    }

    for (const evento of pendientes) yield evento;

    const sinFirma = ejecutada.llamadas.filter((llamada) => !llamada.extra).map((llamada) => llamada.nombre);
    yield* emitirDiagnostico({
      tipo: 'ronda',
      titulo:
        ejecutada.llamadas.length === 0
          ? `Ronda ${ronda + 1}: el modelo respondió con texto`
          : `Ronda ${ronda + 1}: el modelo pidió ${ejecutada.llamadas.length} consulta${
              ejecutada.llamadas.length === 1 ? '' : 's'
            }`,
      duracionMs: ejecutada.duracionMs,
      detalle: {
        mensajesEnviados: ejecutada.mensajesEnviados,
        caracteresDeTexto: ejecutada.texto.length,
        llamadas: ejecutada.llamadas.map((llamada) => ({
          nombre: llamada.nombre,
          argumentos: llamada.argumentos,
          tieneFirma: Boolean(llamada.extra),
        })),
        ...(sinFirma.length > 0
          ? { advertencia: `Sin thought_signature: ${sinFirma.join(', ')}. Gemini rechazará la próxima ronda.` }
          : {}),
      },
    });

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
      const { argumentos, problema } = parsearArgumentos(llamada.argumentos);

      if (problema) {
        yield* emitirDiagnostico({
          tipo: 'error',
          titulo: `Argumentos ilegibles en ${llamada.nombre}`,
          detalle: { crudo: recortar(llamada.argumentos), problema },
        });
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: `${problema} Volvé a llamar la herramienta con un JSON válido.`,
        });
        continue;
      }

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

      const inicioHerramienta = Date.now();
      try {
        const resultado = await herramienta.ejecutar(argumentos);
        yield { tipo: 'datos', herramienta: llamada.nombre, formato: herramienta.formato, resultado };
        yield* emitirDiagnostico({
          tipo: 'herramienta',
          titulo: `${llamada.nombre} respondió`,
          duracionMs: Date.now() - inicioHerramienta,
          detalle: { argumentos, resultado: recortar(resultado, 800) },
        });
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: JSON.stringify(resultado),
        });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        yield* emitirDiagnostico({
          tipo: 'error',
          titulo: `${llamada.nombre} falló`,
          duracionMs: Date.now() - inicioHerramienta,
          detalle: { argumentos, error: mensaje },
        });
        mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: `Error: ${mensaje}` });
      }
    }
  }

  // Agotadas las rondas, en vez de tirar todo lo consultado se le pide al modelo
  // que redacte la respuesta con lo que ya tiene sobre la mesa.
  mensajes.push({
    role: 'user',
    content:
      'Ya no podés hacer más consultas. Respondé ahora con los datos que ya obtuviste, diciendo explícitamente qué parte de la pregunta quedó sin cubrir.',
  });

  const pendientesCierre: EventoChat[] = [];
  try {
    const cierre = await ejecutarRonda(
      configuracion,
      mensajes,
      (delta) => {
        pendientesCierre.push({ tipo: 'texto', delta });
      },
      true,
    );

    for (const evento of pendientesCierre) yield evento;

    yield* emitirDiagnostico({
      tipo: 'ronda',
      titulo: 'Ronda de cierre: se agotó el tope de consultas',
      duracionMs: cierre.duracionMs,
      detalle: {
        topeRondas: MAX_RONDAS_DE_HERRAMIENTAS,
        caracteresDeTexto: cierre.texto.length,
      },
    });

    if (cierre.texto.trim() === '') {
      yield {
        tipo: 'error',
        mensaje:
          'La consulta necesitó más pasos de los permitidos. Probá pedir menos bloques por vez, o acotarla a un período o a un concesionario.',
      };
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    yield { tipo: 'error', mensaje };
  }

  yield { tipo: 'fin' };
}
