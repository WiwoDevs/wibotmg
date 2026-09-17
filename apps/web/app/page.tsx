import { redirect } from 'next/navigation';
import { obtenerConfiguracion } from '@wibot/core';
import { Conversacion } from '@/componentes/Conversacion';
import { esModoDiagnostico } from '@/lib/diagnostico';
import { obtenerUsuarioActual } from '@/lib/sesion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pantalla única de WiWO Me. Comprueba la sesión antes de renderizar nada:
 * el middleware solo mira si la cookie existe, acá se valida de verdad.
 */
export default async function Pagina() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect('/entrar');
  if (usuario.debeCambiar) redirect('/entrar');

  const { db, modoPrivacidad } = obtenerConfiguracion();

  return (
    <Conversacion
      nombreBase={db.database}
      modoPrivacidad={modoPrivacidad}
      usuario={{ nombre: usuario.nombre, correo: usuario.correo }}
      modoDiagnostico={esModoDiagnostico()}
    />
  );
}
