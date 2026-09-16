import { obtenerConfiguracion } from '@wibot/core';
import { Conversacion } from '@/componentes/Conversacion';

export const dynamic = 'force-dynamic';

/**
 * Pantalla única de WiBot. Resuelve en el servidor a qué base apunta la
 * instancia para mostrarlo en la cabecera sin exponer credenciales.
 */
export default function Pagina() {
  const { db, modoPrivacidad } = obtenerConfiguracion();
  return <Conversacion nombreBase={db.database} modoPrivacidad={modoPrivacidad} />;
}
