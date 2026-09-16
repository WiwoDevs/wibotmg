#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { cerrarBaseAcceso } from './base.js';
import { generarContrasenaTemporal } from './contrasenas.js';
import { listarAuditoria } from './auditoria.js';
import {
  cambiarActivacion,
  cambiarContrasena,
  crearUsuario,
  listarUsuarios,
} from './usuarios.js';

const AYUDA = `Gestión de acceso a WiBot

  npm run usuarios -- crear <correo> "<nombre>"   Da de alta y muestra una contraseña temporal
  npm run usuarios -- listar                      Lista los usuarios y su estado
  npm run usuarios -- clave <correo>              Genera una contraseña nueva
  npm run usuarios -- activar <correo>            Reactiva una cuenta
  npm run usuarios -- desactivar <correo>         Bloquea la cuenta y cierra sus sesiones
  npm run usuarios -- auditoria [cantidad]        Últimas consultas registradas
`;

/** Pide una confirmación por consola antes de una acción que afecta a alguien. */
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

async function principal(): Promise<void> {
  const [comando, ...argumentos] = process.argv.slice(2);

  switch (comando) {
    case 'crear': {
      const [correo, nombre] = argumentos;
      if (!correo || !nombre) {
        throw new Error('Uso: crear <correo> "<nombre>"');
      }
      const temporal = generarContrasenaTemporal();
      const usuario = await crearUsuario(correo, nombre, temporal, true);
      stdout.write(`\nUsuario creado: ${usuario.nombre} <${usuario.correo}>\n`);
      stdout.write(`Contraseña temporal: ${temporal}\n`);
      stdout.write('Entregala por un canal seguro. Se le pedirá cambiarla al entrar.\n\n');
      break;
    }

    case 'listar': {
      const usuarios = listarUsuarios();
      if (usuarios.length === 0) {
        stdout.write('Todavía no hay usuarios. Creá el primero con: crear <correo> "<nombre>"\n');
        break;
      }
      stdout.write('\nestado    último acceso      correo\n');
      stdout.write('-------   ----------------   ------\n');
      for (const usuario of usuarios) {
        const estado = usuario.activo ? (usuario.debeCambiar ? 'pendiente' : 'activo   ') : 'inactivo ';
        stdout.write(`${estado} ${formatearFecha(usuario.ultimoAcceso).padEnd(18)} ${usuario.correo}  (${usuario.nombre})\n`);
      }
      stdout.write('\n');
      break;
    }

    case 'clave': {
      const [correo] = argumentos;
      if (!correo) throw new Error('Uso: clave <correo>');
      const temporal = generarContrasenaTemporal();
      await cambiarContrasena(correo, temporal, true);
      stdout.write(`\nContraseña temporal para ${correo}: ${temporal}\n`);
      stdout.write('Se le pedirá cambiarla la próxima vez que entre.\n\n');
      break;
    }

    case 'activar':
    case 'desactivar': {
      const [correo] = argumentos;
      if (!correo) throw new Error(`Uso: ${comando} <correo>`);
      const activar = comando === 'activar';
      if (!activar && !(await confirmar(`Vas a cerrar todas las sesiones de ${correo}. ¿Seguimos?`))) {
        stdout.write('Cancelado.\n');
        break;
      }
      const usuario = cambiarActivacion(correo, activar);
      stdout.write(`${usuario.correo} quedó ${usuario.activo ? 'activo' : 'inactivo'}.\n`);
      break;
    }

    case 'auditoria': {
      const cantidad = Number.parseInt(argumentos[0] ?? '20', 10);
      const registros = listarAuditoria(Number.isFinite(cantidad) ? cantidad : 20);
      if (registros.length === 0) {
        stdout.write('No hay consultas registradas todavía.\n');
        break;
      }
      for (const registro of registros) {
        const marca = registro.conDatosPersonales ? ' [datos personales]' : '';
        stdout.write(`${formatearFecha(registro.ocurridoEn)}  ${registro.correo}${marca}\n`);
        stdout.write(`  ${registro.pregunta}\n`);
        stdout.write(`  herramientas: ${registro.herramientas.join(', ') || 'ninguna'}\n\n`);
      }
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
