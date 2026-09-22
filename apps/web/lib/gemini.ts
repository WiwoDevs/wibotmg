import 'server-only';
import { hoyLocal, herramientasComoJsonSchema, obtenerHerramienta } from '@wibot/core';
import { esModoDiagnostico, recortar, registrarEvento } from './diagnostico';
import type { Idioma } from './idioma';
import { obtenerTextos } from './textos';
import type { EventoChat, TurnoEnviado } from './tipos';

/** Textos del chat en el idioma de la conversación en curso. */
type TextosChatServidor = ReturnType<typeof obtenerTextos>['servidor']['chat'];

/**
 * Error de la conversación con el modelo. Lleva un mensaje apto para mostrarle
 * a cualquiera; el cuerpo crudo del proveedor queda solo en el diagnóstico.
 */
class ErrorDelModelo extends Error {
  readonly estado: number | undefined;

  constructor(mensaje: string, estado?: number) {
    super(mensaje);
    this.name = 'ErrorDelModelo';
    this.estado = estado;
  }
}

/** Tamaño máximo del resultado de una herramienta que se le devuelve al modelo. */
const MAX_CARACTERES_RESULTADO = 24000;

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
 *
 * @param textos mensajes en el idioma de la conversación.
 * @throws {Error} si falta la clave de API.
 */
function obtenerConfiguracionModelo(textos: TextosChatServidor): ConfiguracionModelo {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(textos.faltaApiKey);
  }
  return {
    apiKey,
    baseUrl: (process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, ''),
    modelo: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash',
  };
}

/** Nombre del idioma de la app tal como se le pide al modelo que responda. */
const IDIOMA_DE_RESPUESTA: Record<Idioma, string> = {
  es: 'neutral Rioplatense Spanish (español rioplatense neutro)',
  en: 'English',
  zh: 'Simplified Chinese (简体中文)',
};

/**
 * Construye la instrucción de sistema, con la fecha de hoy ya resuelta.
 *
 * @param idioma idioma de la app; el modelo responde siempre en él.
 * @returns el texto completo de la instrucción de sistema.
 */
function construirInstruccionDeSistema(idioma: Idioma): string {
  const lenguaje = IDIOMA_DE_RESPUESTA[idioma];
  return `You are the Thinking Orb of WiWO Me, WIWO's executive intelligence on MG Contact's business in Chile: sales, customer service and service operations.

Today is ${hoyLocal()}.

The person asking is senior management, and what matters to them first is sales: leads, temperature, conversion, and the performance of each point of sale and each salesperson. Customer satisfaction comes next, and service coupon volume is operational context, not the core of the business.

You have two sources:

1. Management (commercial and customer relationship): CRM leads with their temperature (Super Caliente, Caliente, Tibio, Frío), point of sale, origin, salesperson and whether they converted into a sale; after-sales surveys with scores from 1 to 7 and NPS; phone log and statistics by extension. Tools: leads, buscar_lead, encuestas_posventa, llamadas, buscar_llamadas, anexos_telefonia.

2. Service coupons (workshop operations): one record per coupon issued, with dealer, branch, advisor, vehicle (VIN, license plate, model) and customer. Since March 2025. Tools: resumen_operacion, ranking, serie_temporal, valores_dimension, buscar_cliente, historial_vehiculo.

How you work:
- Query the database before giving any figure. Do not estimate, recall or interpolate.
- For a general or ambiguous question ("how are we doing", "how is the month going", "how is a given dealer doing"), do not stop at coupons: build the full picture by querying the commercial side first (leads and conversion), then satisfaction (NPS), and only then service volume.
- Choose the source by topic: leads for commercial and sales, surveys for satisfaction, calls for the contact center, coupons for workshop service volume.
- Answer only from coupons when the question is explicitly about the workshop, service, coupons, advisors, license plates or vehicles. If it is about the business, start with sales.
- When you give a coupon figure in a business answer, pair it with the commercial data for the same period so it reads as a snapshot, not a loose number.
- Before filtering by a name you are not sure exists, confirm it with valores_dimension.
- consulta_sql is the last resort; state the source and check esquema_cupones or esquema_gestion first.
- Never describe the database structure or table or column names: the person asking is management and expects business figures, not schemas.
- If you are asked for several blocks in a single question, request all the queries you can in the same batch instead of one at a time.
- If a question needs several queries, run them all before answering.
- NPS is an index from -100 to 100, not a percentage: say "NPS 61", never "61%".
- The loaded leads and calls are only from August 2026: do not present them as historical or compare them with months that do not exist. If you are asked about sales in a period that is not covered, say so and show what is available instead of replacing it with coupons without warning.

How you answer:
- Always reply in ${lenguaje} — the language selected in the app — even if the question or previous turns are in another language. Keep proper names (people, dealers, branches, vehicle models) as they appear in the data, but translate category labels such as lead temperatures (Super Caliente, Caliente, Tibio, Frío), statuses and sources into that language.
- Neutral, direct tone, with no preambles or apologies.
- Two or three sentences. The figure first, then what explains it. In general questions, the opening figure is the commercial one.
- Always state which period the number refers to.
- Do not repeat in text the table already shown below: comment on what matters in it.
- If the data is dirty or incomplete, say so plainly.
- If the database has nothing to answer with, say what is missing instead of making something up.
- Personal data comes masked except in specific lookups. Do not try to get around that.`;
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
    return { argumentos: {}, problema: 'The arguments are not a JSON object.' };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { argumentos: {}, problema: `The arguments are not valid JSON: ${detalle}` };
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
 * @param textos mensajes en el idioma de la conversación.
 * @param sinHerramientas si es true no se le ofrecen herramientas al modelo.
 * @throws {Error} si la API responde con un código de error.
 */
async function ejecutarRonda(
  configuracion: ConfiguracionModelo,
  mensajes: MensajeModelo[],
  alRecibirTexto: (delta: string) => void,
  textos: TextosChatServidor,
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
      titulo: textos.diagnostico.modeloInalcanzable,
      duracionMs: Date.now() - comenzoEn,
      detalle: { url: `${configuracion.baseUrl}/chat/completions`, error: detalle },
    });
    throw new ErrorDelModelo(textos.sinConexion);
  }

  if (!respuesta.ok || !respuesta.body) {
    const detalle = await respuesta.text().catch(() => '');
    const explicacion =
      respuesta.status === 401 || respuesta.status === 403
        ? textos.sinAutenticacion
        : respuesta.status === 429
          ? textos.demasiadosPedidos
          : respuesta.status >= 500
            ? textos.modeloNoDisponible
            : textos.consultaNoCompletada;
    registrarEvento({
      tipo: 'error',
      titulo: textos.diagnostico.modeloRespondio(respuesta.status),
      duracionMs: Date.now() - comenzoEn,
      detalle: {
        estado: respuesta.status,
        cuerpo: recortar(detalle, 2000),
        modelo: configuracion.modelo,
        mensajesEnviados: mensajes.length,
        ultimoMensaje: recortar(mensajes[mensajes.length - 1], 600),
      },
    });
    throw new ErrorDelModelo(explicacion, respuesta.status);
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
 * Serializa el resultado de una herramienta para devolvérselo al modelo,
 * recortándolo si es enorme. El bloque de datos que ve la persona siempre
 * lleva el resultado completo: el recorte es solo para la petición.
 */
function recortarResultado(resultado: unknown): string {
  const texto = JSON.stringify(resultado) ?? 'null';
  if (texto.length <= MAX_CARACTERES_RESULTADO) return texto;
  return `${texto.slice(0, MAX_CARACTERES_RESULTADO)}… [result truncated; request a narrower slice if you need the rest]`;
}

/**
 * Reescribe el historial sin ninguna llamada a herramienta: los resultados ya
 * obtenidos pasan a ser texto dentro de un mensaje de la persona.
 *
 * Es el plan B cuando el modelo rechaza la petición. Quitar solo las firmas de
 * razonamiento no alcanza: Gemini exige una firma en cada llamada que se le
 * devuelve y rechaza igual las que no la traen. Sin llamadas en el historial,
 * esa exigencia desaparece y el modelo puede responder con lo que ya se consultó.
 */
function sanearHistorial(mensajes: MensajeModelo[]): MensajeModelo[] {
  const saneados: MensajeModelo[] = [];
  const resultados: string[] = [];
  const nombrePorLlamada = new Map<string, string>();

  for (const mensaje of mensajes) {
    if (mensaje.tool_calls) {
      for (const llamada of mensaje.tool_calls) {
        nombrePorLlamada.set(llamada.id, llamada.function.name);
      }
      if (typeof mensaje.content === 'string' && mensaje.content.trim() !== '') {
        saneados.push({ role: 'assistant', content: mensaje.content });
      }
      continue;
    }

    if (mensaje.role === 'tool') {
      const nombre = nombrePorLlamada.get(mensaje.tool_call_id ?? '') ?? 'query';
      const contenido = typeof mensaje.content === 'string' ? mensaje.content : '';
      const recortado = contenido.length > 6000 ? `${contenido.slice(0, 6000)}… [truncated]` : contenido;
      resultados.push(`Result of ${nombre}: ${recortado}`);
      continue;
    }

    saneados.push(mensaje);
  }

  if (resultados.length > 0) {
    saneados.push({
      role: 'user',
      content: `This is the data already queried from the database. Use it to answer:\n\n${resultados.join('\n\n')}`,
    });
  }

  return saneados;
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
 * Pide una respuesta final sin ofrecer herramientas, para que el modelo redacte
 * con los datos que ya reunió. Es la salida digna cuando se agotan las rondas o
 * cuando el modelo rechaza seguir: la persona igual recibe lo consultado.
 *
 * @param configuracion credenciales y modelo.
 * @param mensajes historial con los resultados ya obtenidos.
 * @param textos mensajes en el idioma de la conversación.
 */
async function* cerrarConLoReunido(
  configuracion: ConfiguracionModelo,
  mensajes: MensajeModelo[],
  textos: TextosChatServidor,
): AsyncGenerator<EventoChat> {
  const historial: MensajeModelo[] = [
    ...mensajes,
    {
      role: 'user',
      content:
        'You cannot run any more queries. Answer now with the data you already obtained, stating explicitly which part of the question was left uncovered.',
    },
  ];

  const pendientes: EventoChat[] = [];
  try {
    const cierre = await ejecutarRonda(
      configuracion,
      historial,
      (delta) => {
        pendientes.push({ tipo: 'texto', delta });
      },
      textos,
      true,
    );

    for (const evento of pendientes) yield evento;

    if (cierre.texto.trim() === '') {
      yield {
        tipo: 'error',
        mensaje: textos.sinCierre,
      };
    }
  } catch (error) {
    const mensaje =
      error instanceof ErrorDelModelo
        ? error.message
        : textos.respuestaIncompleta;
    yield { tipo: 'error', mensaje };
  }
}

/**
 * Conduce un turno completo de conversación: rondas de consulta a la base
 * hasta que el modelo tenga con qué responder, y luego la respuesta en texto.
 *
 * @param historial turnos previos de la conversación, del más antiguo al más reciente.
 * @param pregunta lo que acaba de escribir la persona.
 * @param idioma idioma de la app; el modelo responde y los errores se redactan en él.
 * @yields eventos de progreso, datos y texto para la interfaz.
 */
export async function* conversar(
  historial: TurnoEnviado[],
  pregunta: string,
  idioma: Idioma,
): AsyncGenerator<EventoChat> {
  const textos = obtenerTextos(idioma).servidor.chat;
  const configuracion = obtenerConfiguracionModelo(textos);

  const mensajes: MensajeModelo[] = [
    { role: 'system', content: construirInstruccionDeSistema(idioma) },
    ...historial.map((turno): MensajeModelo => ({
      role: turno.autor === 'persona' ? 'user' : 'assistant',
      content: turno.texto,
    })),
    { role: 'user', content: pregunta },
  ];

  for (let ronda = 0; ronda < MAX_RONDAS_DE_HERRAMIENTAS; ronda += 1) {
    let pendientes: EventoChat[] = [];
    let ejecutada: RondaStream;
    try {
      ejecutada = await ejecutarRonda(configuracion, mensajes, (delta) => {
        pendientes.push({ tipo: 'texto', delta });
      }, textos);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      yield* emitirDiagnostico({
        tipo: 'error',
        titulo: textos.diagnostico.rondaFallo(ronda + 1),
        detalle: { error: mensaje, mensajesEnviados: mensajes.length },
      });

      // El modelo rechazó el contexto acumulado. Antes de rendirse se reintenta
      // una vez con el historial simplificado; si tampoco entra, se cierra con
      // lo que ya se consultó en vez de dejar a la persona sin respuesta.
      const datosReunidos = mensajes.some((entrada) => entrada.role === 'tool');
      if (!datosReunidos) throw error;

      pendientes = [];
      const saneados = sanearHistorial(mensajes);
      try {
        ejecutada = await ejecutarRonda(
          configuracion,
          saneados,
          (delta) => {
            pendientes.push({ tipo: 'texto', delta });
          },
          textos,
          true,
        );
        yield* emitirDiagnostico({
          tipo: 'ronda',
          titulo: textos.diagnostico.rondaRecuperada(ronda + 1),
          detalle: { mensajesEnviados: saneados.length, caracteresDeTexto: ejecutada.texto.length },
        });
        for (const evento of pendientes) yield evento;
        yield { tipo: 'fin' };
        return;
      } catch (segundoError) {
        const detalle = segundoError instanceof Error ? segundoError.message : String(segundoError);
        yield* emitirDiagnostico({
          tipo: 'error',
          titulo: textos.diagnostico.reintentoFallo(ronda + 1),
          detalle: { error: detalle },
        });
        yield {
          tipo: 'error',
          mensaje:
            segundoError instanceof ErrorDelModelo
              ? segundoError.message
              : textos.consultaNoCompletadaCorta,
        };
        yield { tipo: 'fin' };
        return;
      }
    }

    for (const evento of pendientes) yield evento;

    const sinFirma = ejecutada.llamadas.filter((llamada) => !llamada.extra).map((llamada) => llamada.nombre);
    yield* emitirDiagnostico({
      tipo: 'ronda',
      titulo:
        ejecutada.llamadas.length === 0
          ? textos.diagnostico.rondaConTexto(ronda + 1)
          : textos.diagnostico.rondaConConsultas(ronda + 1, ejecutada.llamadas.length),
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
          ? { advertencia: `Missing thought_signature: ${sinFirma.join(', ')}. Gemini will reject the next round.` }
          : {}),
      },
    });

    if (ejecutada.llamadas.length === 0) {
      if (ejecutada.texto.trim() === '') {
        yield {
          tipo: 'error',
          mensaje: textos.sinRespuesta,
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
          titulo: textos.diagnostico.argumentosIlegibles(llamada.nombre),
          detalle: { crudo: recortar(llamada.argumentos), problema },
        });
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: `${problema} Call the tool again with valid JSON.`,
        });
        continue;
      }

      yield { tipo: 'consultando', herramienta: llamada.nombre, argumentos };

      const herramienta = obtenerHerramienta(llamada.nombre);
      if (!herramienta) {
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: `The tool "${llamada.nombre}" does not exist.`,
        });
        continue;
      }

      const inicioHerramienta = Date.now();
      try {
        const resultado = await herramienta.ejecutar(argumentos);
        yield { tipo: 'datos', herramienta: llamada.nombre, formato: herramienta.formato, resultado };
        yield* emitirDiagnostico({
          tipo: 'herramienta',
          titulo: textos.diagnostico.herramientaRespondio(llamada.nombre),
          duracionMs: Date.now() - inicioHerramienta,
          detalle: { argumentos, resultado: recortar(resultado, 800) },
        });
        mensajes.push({
          role: 'tool',
          tool_call_id: llamada.id,
          content: recortarResultado(resultado),
        });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : String(error);
        yield* emitirDiagnostico({
          tipo: 'error',
          titulo: textos.diagnostico.herramientaFallo(llamada.nombre),
          duracionMs: Date.now() - inicioHerramienta,
          detalle: { argumentos, error: mensaje },
        });
        mensajes.push({ role: 'tool', tool_call_id: llamada.id, content: `Error: ${mensaje}` });
      }
    }
  }

  // Agotadas las rondas, en vez de tirar todo lo consultado se le pide al modelo
  // que redacte la respuesta con lo que ya tiene sobre la mesa.
  yield* emitirDiagnostico({
    tipo: 'ronda',
    titulo: textos.diagnostico.topeAgotado,
    detalle: { topeRondas: MAX_RONDAS_DE_HERRAMIENTAS },
  });

  yield* cerrarConLoReunido(configuracion, mensajes, textos);
  yield { tipo: 'fin' };
}
