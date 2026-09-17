#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { cerrarBaseAcceso } from './base.js';
import {
  crearTokenServicio,
  listarTokensServicio,
  revocarTokenServicio,
  type TokenServicio,
} from './tokens.js';

const AYUDA = `Tokens de servicio de WiBot (acceso de otras páginas a la API)

  npm run tokens -- crear <nombre> [origen...]   Da de alta un token y lo muestra una sola vez
  npm run tokens -- listar                       Lista los tokens, su estado y su último uso
  npm run tokens -- revocar <nombre>             Deja el token fuera de servicio

Los orígenes son las páginas que van a llamar desde un navegador, con esquema y
puerto: https://sitio.cl. Sin orígenes, el token sirve solo de servidor a servidor.
`;

/** Pide una confirmación por consola antes de una acción que corta un acceso en uso. */
async function confirmar(pregunta: string): Promise<boolean> {
  const consola = createInterface({ input: stdin, output: stdout });
  try {
    const respuesta = await consola.question(`${pregunta} [s/N] `);
    return respuesta.trim().toLowerCase() === 's';
  } finally {
    consola.close();
  }
}

function formatearFecha(iso: string | null): string {
  if (!iso) return 'nunca';
  return iso.replace('T', ' ').slice(0, 16);
}

function describirOrigenes(registro: TokenServicio): string {
  return registro.origenes.length === 0 ? 'solo servidor' : registro.origenes.join(' ');
}

async function principal(): Promise<void> {
  const [comando, ...argumentos] = process.argv.slice(2);

  switch (comando) {
    case 'crear': {
      const [nombre, ...origenes] = argumentos;
      if (!nombre) throw new Error('Uso: crear <nombre> [origen...]');

      const { token, registro } = crearTokenServicio(nombre, origenes);
      stdout.write(`\nToken "${registro.nombre}" creado.\n`);
      stdout.write(`Orígenes: ${describirOrigenes(registro)}\n\n`);
      stdout.write(`${token}\n\n`);
      stdout.write('Copialo ahora: no se vuelve a mostrar, en la base solo queda su hash.\n');
      stdout.write('Se manda en cada petición como: Authorization: Bearer <token>\n\n');
      break;
    }

    case 'listar': {
      const tokens = listarTokensServicio();
      if (tokens.length === 0) {
        stdout.write('No hay tokens de servicio. Creá el primero con: crear <nombre> [origen...]\n');
        break;
      }
      stdout.write('\nestado     último uso         nombre / orígenes\n');
      stdout.write('--------   ----------------   -----------------\n');
      for (const registro of tokens) {
        const estado = registro.activo ? 'activo  ' : 'revocado';
        stdout.write(`${estado}   ${formatearFecha(registro.ultimoUso).padEnd(18)} ${registro.nombre}\n`);
        stdout.write(`                              ${describirOrigenes(registro)}\n`);
      }
      stdout.write('\n');
      break;
    }

    case 'revocar': {
      const [nombre] = argumentos;
      if (!nombre) throw new Error('Uso: revocar <nombre>');
      if (!(await confirmar(`El token "${nombre}" va a dejar de funcionar en el acto. ¿Seguimos?`))) {
        stdout.write('Cancelado.\n');
        break;
      }
      const registro = revocarTokenServicio(nombre);
      stdout.write(`${registro.nombre} quedó revocado.\n`);
      break;
    }

    default:
      stdout.write(AYUDA);
      if (comando !== undefined && comando !== '--help' && comando !== '-h') {
        process.exitCode = 1;
      }
  }
}

principal()
  .catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n${mensaje}\n\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    cerrarBaseAcceso();
  });
