/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Content-Security-Policy: бодит, ажиллах боломжтой бодлого.
// - script-src: 'self' нь /theme-bootstrap.js (same-origin) болон Next.js-ийн
//   chunk-уудыг хамарна. 'unsafe-inline' нь Next.js-ийн inline bootstrap
//   script-уудад (мөн зарим inline) шаардлагатай pragmatic dev default —
//   production-д nonce руу шилжих нь зохистой.
// - style-src: апп `style=` inline attribute ашигладаг тул 'unsafe-inline' хэрэгтэй.
// - connect-src 'self': browser зөвхөн same-origin BFF (/api/*) рүү хандана.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Google профайл зураг (dashboard-д холбогдсон Google account) нь
  // lh3.googleusercontent.com зэрэг Google CDN-ээс ирдэг тул зөвшөөрнө.
  // gstatic — Google Drive интеграцийн файлын icon (iconLink) ба browser-т
  // шууд ачаалагддаг тул зөвшөөрнө.
  "img-src 'self' data: https://*.googleusercontent.com https://*.gstatic.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  // frame-src: Google Drive + Dropbox файлын урьдчилан харах (preview) iframe —
  // эдгээр нь провайдерын интерактив preview хуудас тул BFF-ээр дамжуулах
  // боломжгүй (провайдер proxied origin-оос framing-ийг татгалздаг). Интеграцийн
  // OAuth тохируулаагүй үед эдгээр хост руу хэзээ ч хандахгүй (feature inert).
  "frame-src 'self' https://drive.google.com https://docs.google.com https://*.dropboxusercontent.com https://www.dropbox.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  // Standalone output → slim production Docker image (server.js + minimal
  // node_modules) instead of shipping the whole tree. See frontend/Dockerfile.
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  // iOS Universal Links — Apple нь /.well-known/apple-app-site-association-ыг
  // татдаг. Next.js dot-folder route-ыг найдваргүй тул /api/aasa руу rewrite хийнэ.
  async rewrites() {
    return [
      { source: '/.well-known/apple-app-site-association', destination: '/api/aasa' },
    ];
  },
  // Security headers applied to every response.
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      { key: 'Content-Security-Policy', value: CSP },
    ];

    // HSTS-ийг зөвхөн production-д илгээнэ — dev дээр http тул HSTS тохиромжгүй.
    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
      });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
