import { obtenerConfiguracionAcceso, hayUsuariosActivos } from '@wibot/auth';
import { FormularioEntrar } from '@/componentes/FormularioEntrar';
import { obtenerUsuarioActual } from '@/lib/sesion';
import estilos from '@/componentes/entrar.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ volver?: string }>;
}

/**
 * Pantalla de entrada. Si todavía no hay ninguna cuenta creada avisa cómo
 * crear la primera, en vez de dejar un formulario contra el que nadie puede entrar.
 */
export default async function PaginaEntrar({ searchParams }: Props) {
  const { volver } = await searchParams;
  const { largoMinimoContrasena } = obtenerConfiguracionAcceso();
  const usuario = await obtenerUsuarioActual();

  if (!hayUsuariosActivos()) {
    return (
      <main className={estilos.pantalla}>
        <div className={estilos.tarjeta}>
          <h1 className={estilos.titulo}>WiWO Me todavía no tiene cuentas</h1>
          <p className={estilos.introduccion}>
            Nadie puede entrar hasta que se cree la primera. En el servidor, desde la raíz del
            proyecto:
          </p>
          <pre className={estilos.entrada}>npm run usuarios -- crear correo@wiwo.me &quot;Nombre&quot;</pre>
        </div>
      </main>
    );
  }

  const destino = volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';

  return (
    <FormularioEntrar
      volver={destino}
      largoMinimo={largoMinimoContrasena}
      cambioObligatorio={usuario?.debeCambiar ?? false}
      {...(usuario ? { correoEnSesion: usuario.correo } : {})}
    />
  );
}
