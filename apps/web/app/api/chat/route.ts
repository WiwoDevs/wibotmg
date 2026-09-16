import { registrarConsulta } from '@wibot/auth';
import { conversar } from '@/lib/gemini';
import { obtenerIp, obtenerUsuarioActual } from '@/lib/sesion';
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

/**
 * Responde una pregunta de la persona con un flujo NDJSON de eventos:
 * consultas en curso, bloques de datos y el texto de WiBot a medida que se genera.
 */
export async function POST(peticion: Request): Promise<Response> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return Response.json({ error: 'Tu sesión expiró. Volvé a entrar.' }, { status: 401 });
  }

  let cuerpo: CuerpoPeticion;
  try {
    cuerpo = (await peticion.json()) as CuerpoPeticion;
  } catch {
    return Response.json({ error: 'El cuerpo de la petición no es JSON válido.' }, { status: 400 });
  }

  const pregunta = typeof cuerpo.pregunta === 'string' ? cuerpo.pregunta.trim() : '';
  if (pregunta === '') {
    return Response.json({ error: 'Escribí una pregunta.' }, { status: 400 });
  }
  if (pregunta.length > 2000) {
    return Response.json({ error: 'La pregunta es demasiado larga.' }, { status: 400 });
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
        registrarConsulta(usuario.id, usuario.correo, pregunta, herramientasUsadas, ip);
        controlador.close();
      }
    },
  });

  return new Response(flujo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
