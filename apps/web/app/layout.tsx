import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans, Tomorrow } from 'next/font/google';
import { ProveedorIdioma } from '@/componentes/ProveedorIdioma';
import { LOCALE_IDIOMA } from '@/lib/idioma';
import { obtenerIdiomaActual } from '@/lib/idioma-servidor';
import { obtenerTextos } from '@/lib/textos';
import './globals.css';


const interfaz = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--fuente-interfaz',
  display: 'swap',
  // Respaldo para los caracteres chinos, que las fuentes de marca no traen.
  fallback: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
});

const marca = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--fuente-marca',
  display: 'swap',
  // Respaldo para los caracteres chinos, que las fuentes de marca no traen.
  fallback: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
});

const datos = Tomorrow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fuente-datos',
  display: 'swap',
  // Respaldo para los caracteres chinos, que las fuentes de marca no traen.
  fallback: ['PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
});

/** Título y descripción del documento en el idioma elegido. */
export async function generateMetadata(): Promise<Metadata> {
  const idioma = await obtenerIdiomaActual();
  return { title: 'WiWO Me', description: obtenerTextos(idioma).comun.metaDescripcion };
}

export const viewport: Viewport = {
  themeColor: '#f8fad7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const idioma = await obtenerIdiomaActual();
  return (
    <html lang={LOCALE_IDIOMA[idioma]} className={`${interfaz.variable} ${marca.variable} ${datos.variable}`}>
      <body>
        <ProveedorIdioma idiomaInicial={idioma}>{children}</ProveedorIdioma>
      </body>
    </html>
  );
}
