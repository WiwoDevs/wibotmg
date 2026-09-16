import type { Metadata, Viewport } from 'next';
import { Archivo, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';

const interfaz = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-interfaz',
  display: 'swap',
});

const datos = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fuente-datos',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WiBot · Inteligencia ejecutiva MG Contact',
  description:
    'Preguntale en castellano a la base de cupones de servicio de MG Contact y recibí la cifra con su período.',
};

export const viewport: Viewport = {
  themeColor: '#070b09',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${interfaz.variable} ${datos.variable}`}>
      <body>{children}</body>
    </html>
  );
}
