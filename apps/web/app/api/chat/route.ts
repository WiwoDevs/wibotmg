import { registrarConsulta } from '@wibot/auth';
import { autenticarPeticion, cabecerasCors, responderJson, responderPreflight } from '@/lib/acceso';
import { conversar } from '@/lib/gemini';
import { obtenerIp } from '@/lib/sesion';
import type { EventoChat, TurnoEnviado } from '@/lib/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CuerpoPeticion {
  pregunta?: unknown;
  historial?: unknown;
}

/** Valida y normaliza el historial recibido del navegador. */
function normalizarHistorial(valor: unknown): TurnoEnviado[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((turno): turno is Record<string, unknown> => typeof turno === 'object' && turno !== null)
    .filter((turno) => turno.autor === 'persona' || turno.autor === 'wibot')
    .filter((turno) => typeof turno.texto === 'string' && turno.texto.trim() !== '')
    .slice(-12)
    .map((turno) => ({ autor: turno.autor as 'persona' | 'wibot', texto: String(turno.texto) }));
}

/** Deja que una página externa autorizada consulte el chat desde el navegador. */
export function OPTIONS(peticion: Request): Response {
  return responderPreflight(peticion);
}

/**
 * Responde una pregunta de la persona con un flujo NDJSON de eventos:
 * consultas en curso, bloques de datos y el texto del Thinking Orb a medida que se genera.
 */
export async function POST(peticion: Request): Promise<Response> {
  const acceso = await autenticarPeticion(peticion);
  if (!acceso.ok) return acceso.respuesta;
  const { actor } = acceso;

  let cuerpo: CuerpoPeticion;
  try {
    cuerpo = (await peticion.json()) as CuerpoPeticion;
  } catch {
    return responderJson({ error: 'El cuerpo de la petición no es JSON válido.' }, 400, actor.origen);
  }

  const pregunta = typeof cuerpo.pregunta === 'string' ? cuerpo.pregunta.trim() : '';
  if (pregunta === '') {
    return responderJson({ error: 'Escribí una pregunta.' }, 400, actor.origen);
  }
  if (pregunta.length > 2000) {
    return responderJson({ error: 'La pregunta es demasiado larga.' }, 400, actor.origen);
  }

  const historial = normalizarHistorial(cuerpo.historial);
  const ip = await obtenerIp(peticion);
  const codificador = new TextEncoder();

  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const emitir = (evento: EventoChat): void => {
        controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`));
      };

      const herramientasUsadas: string[] = [];

      try {
        for await (const evento of conversar(historial, pregunta)) {
          if (evento.tipo === 'consultando') herramientasUsadas.push(evento.herramienta);
          emitir(evento);
        }
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : 'Error inesperado al consultar la base.';
        emitir({ tipo: 'error', mensaje });
        emitir({ tipo: 'fin' });
      } finally {
        registrarConsulta(actor.usuarioId, actor.etiqueta, pregunta, herramientasUsadas, ip);
        controlador.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      ...cabecerasCors(actor.origen),
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
