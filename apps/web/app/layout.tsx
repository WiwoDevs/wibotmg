import type { Metadata, Viewport } from 'next';
import { Outfit, Plus_Jakarta_Sans, Tomorrow } from 'next/font/google';
import './globals.css';

const interfaz = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--fuente-interfaz',
  display: 'swap',
});

const marca = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--fuente-marca',
  display: 'swap',
});

const datos = Tomorrow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fuente-datos',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WiWO Me',
  description:
    'Preguntale en castellano a la base de cupones de servicio de MG Contact y recibí la cifra con su período.',
};

export const viewport: Viewport = {
  themeColor: '#f8fad7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${interfaz.variable} ${marca.variable} ${datos.variable}`}>
      <body>{children}</body>
    </html>
  );
}
