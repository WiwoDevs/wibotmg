'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COOKIE_IDIOMA, LOCALE_IDIOMA, type Idioma } from '@/lib/idioma';
import { obtenerTextos, type Textos } from '@/lib/textos';

const SEGUNDOS_EN_UN_ANIO = 60 * 60 * 24 * 365;

interface ValorIdioma {
  idioma: Idioma;
  /** Locale BCP 47 listo para Intl (números, fechas, horas). */
  locale: string;
  textos: Textos;
  cambiarIdioma: (nuevo: Idioma) => void;
}

const ContextoIdioma = createContext<ValorIdioma | null>(null);

/**
 * Reparte el idioma elegido a toda la interfaz. Al cambiarlo guarda la cookie,
 * actualiza el atributo lang y refresca los componentes de servidor.
 */
export function ProveedorIdioma({ idiomaInicial, children }: { idiomaInicial: Idioma; children: React.ReactNode }) {
  const router = useRouter();
  const [idioma, setIdioma] = useState<Idioma>(idiomaInicial);

  const cambiarIdioma = useCallback(
    (nuevo: Idioma) => {
      document.cookie = `${COOKIE_IDIOMA}=${nuevo}; path=/; max-age=${SEGUNDOS_EN_UN_ANIO}; samesite=lax`;
      document.documentElement.lang = LOCALE_IDIOMA[nuevo];
      setIdioma(nuevo);
      router.refresh();
    },
    [router],
  );

  const valor = useMemo(
    () => ({ idioma, locale: LOCALE_IDIOMA[idioma], textos: obtenerTextos(idioma), cambiarIdioma }),
    [idioma, cambiarIdioma],
  );

  return <ContextoIdioma.Provider value={valor}>{children}</ContextoIdioma.Provider>;
}

/**
 * Idioma actual, sus textos y la función para cambiarlo.
 *
 * @throws Error si se usa fuera de ProveedorIdioma.
 */
export function useIdioma(): ValorIdioma {
  const valor = useContext(ContextoIdioma);
  if (!valor) throw new Error('useIdioma must be used inside ProveedorIdioma');
  return valor;
}
