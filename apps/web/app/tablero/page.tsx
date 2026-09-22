import { redirect } from 'next/navigation';
import { hoyLocal, obtenerConfiguracion } from '@wibot/core';
import { Tablero } from '@/componentes/Tablero';
import { esModoDiagnostico } from '@/lib/diagnostico';
import { obtenerIdiomaActual } from '@/lib/idioma-servidor';
import { construirPeriodos, PERIODO_POR_DEFECTO } from '@/lib/periodos';
import { obtenerUsuarioActual } from '@/lib/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tablero ejecutivo. Comprueba la sesión igual que el chat: son las mismas
 * cifras y la misma política de acceso. Los períodos se nombran en el idioma elegido.
 */
export default async function PaginaTablero() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect('/entrar');
  if (usuario.debeCambiar) redirect('/entrar');

  const { db, modoPrivacidad } = obtenerConfiguracion();
  const periodos = construirPeriodos(hoyLocal(), 10, await obtenerIdiomaActual());
  const inicial = periodos.some((opcion) => opcion.clave === PERIODO_POR_DEFECTO)
    ? PERIODO_POR_DEFECTO
    : (periodos[0]?.clave ?? '');

  return (
    <Tablero
      periodos={periodos}
      periodoInicial={inicial}
      nombreBase={db.database}
      modoPrivacidad={modoPrivacidad}
      usuario={{ nombre: usuario.nombre, correo: usuario.correo }}
      modoDiagnostico={esModoDiagnostico()}
    />
  );
}
