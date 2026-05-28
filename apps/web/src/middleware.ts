import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = ['/login'];

const ADMIN_ROUTES = [
  '/audit-log',
  '/users',
  '/dues/aging',
  '/stock-movements',
  '/inventory/gold-rate',
  '/settings',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))) {
    return NextResponse.next();
  }

  // Check for session — userRole cookie is set at login with path=/
  // (refreshToken cookie has path=/api/v1/auth so it's not visible here)
  const hasSession = req.cookies.has('userRole');
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // ADMIN route guard — read role from a lightweight cookie set at login
  const role = req.cookies.get('userRole')?.value;
  if (role && role !== 'ADMIN' && ADMIN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))) {
    return NextResponse.redirect(new URL('/403', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static assets, api, and _next
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
