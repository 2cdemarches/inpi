import { NextResponse } from 'next/server';

const APP_PASSWORD = process.env.APP_PASSWORD || 'formalites2024';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Les routes API appelées depuis le dashboard sont déjà protégées par le cookie
  // Le webhook DocuSign n'a pas besoin d'auth
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const cookie = request.cookies.get('auth');
  const authed = cookie?.value === APP_PASSWORD;

  // Page login
  if (pathname === '/login') {
    if (authed) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  // Toutes les autres pages nécessitent d'être connecté
  if (!authed) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
