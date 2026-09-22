import { obtenerConfiguracionAcceso, hayUsuariosActivos } from '@wibot/auth';
import { FormularioEntrar } from '@/componentes/FormularioEntrar';
import { SelectorIdioma } from '@/componentes/SelectorIdioma';
import { obtenerIdiomaActual } from '@/lib/idioma-servidor';
import { obtenerUsuarioActual } from '@/lib/sesion';
import { textosEntrar } from '@/lib/textos/entrar';
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
    const textos = textosEntrar[await obtenerIdiomaActual()];
    return (
      <main className={estilos.pantalla}>
        <div className={estilos.idioma}>
          <SelectorIdioma />
        </div>
        <div className={estilos.tarjeta}>
          <h1 className={estilos.titulo}>{textos.sinCuentasTitulo}</h1>
          <p className={estilos.introduccion}>{textos.sinCuentasTexto}</p>
          <pre className={estilos.entrada}>{`npm run usuarios -- crear correo@wiwo.me "${textos.sinCuentasNombre}"`}</pre>
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
