import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/cookies';

// Хамгаалагдсан хуудаснууд — refresh токен (durable session) байхгүй бол /login руу.
// /admin, /manager нь нэмэлтээр серверийн талд эрхээр (RBAC) шалгагдана.
const PROTECTED = ['/me', '/profile', '/settings', '/admin', '/manager'];
// Нэвтэрсэн хэрэглэгчийг буцаалгүй харуулах ёсгүй auth хуудаснууд.
const AUTH_ONLY = ['/login'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedIn = !!req.cookies.get(REFRESH_COOKIE)?.value;

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (AUTH_ONLY.some((p) => pathname === p || pathname.startsWith(p + '/')) && signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Статик хөрөнгө, API route, Next дотоод замуудаас бусдыг л шалгана.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|brand.webp|theme-bootstrap.js).*)'],
};
