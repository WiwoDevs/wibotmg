import { NextResponse, type NextRequest } from 'next/server';

/** Nombre de la cookie de sesión, repetido acá porque el middleware corre en el runtime Edge. */
const NOMBRE_COOKIE = 'wibot_sesion';

/**
 * Primera barrera de acceso: manda a la pantalla de entrada a quien no traiga
 * cookie de sesión. La validación real del token ocurre en el servidor Node,
 * en cada página y en cada ruta de API.
 */
export function middleware(peticion: NextRequest): NextResponse {
  const tieneCookie = peticion.cookies.has(NOMBRE_COOKIE);
  const { pathname, search } = peticion.nextUrl;

  if (!tieneCookie && pathname !== '/entrar') {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/entrar';
    destino.search = pathname === '/' ? '' : `?volver=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(destino);
  }

  if (tieneCookie && pathname === '/entrar') {
    const destino = peticion.nextUrl.clone();
    destino.pathname = '/';
    destino.search = '';
    return NextResponse.redirect(destino);
  }

  return NextResponse.next();
}

export const config = {
  // Las rutas de API quedan fuera: responden 401 en JSON, que es lo que el
  // cliente sabe interpretar. Redirigirlas daría un HTML donde se espera datos.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
