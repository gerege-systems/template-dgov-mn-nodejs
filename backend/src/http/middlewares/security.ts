// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { AppConfig } from '../../config/config.js';
import { EnvironmentProduction } from '../../constants/index.js';
import type { Middleware } from '../types.js';

/**
 * securityHeadersMiddleware нь хариу болгон дээр жижиг боловч өндөр үр нөлөөтэй
 * багц browser-талын аюулгүй байдлын header-уудыг тогтооно. API өөрөө HTML
 * render хийдэггүй боловч browser-ээс ирэх credential-тэй XHR / fetch дуудалтууд
 * ашиг хүртдэг бөгөөд эдгээр header нь ирээдүйн HTML үйлчилдэг endpoint-уудын
 * эсрэг хямд даатгал юм.
 *
 *   X-Content-Type-Options: nosniff             — MIME sniffing-г идэвхгүй болгоно
 *   X-Frame-Options:        DENY                — <iframe>-ээр clickjacking-г хаана
 *   Referrer-Policy:        strict-origin-...   — Referer-д алдагдах өгөгдлийг хязгаарлана
 *   Content-Security-Policy: default-src 'none' — API-ууд JSON буцаадаг
 *   Strict-Transport-Security                    — зөвхөн production
 */
export function securityHeadersMiddleware(): Middleware {
  const isProduction = AppConfig.ENVIRONMENT === EnvironmentProduction;
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // API хариунууд JSON; тэд хэзээ ч хууль ёсоор script, style, frame, эсвэл
    // зураг ачаалдаггүй.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    // Permissions-Policy: өгөгдмөлөөр бүгдийг татгалзана.
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    );
    // Cross-origin isolation header-ууд (secure_system_guide §4.6/4.7).
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    if (isProduction) {
      // HSTS зөвхөн production-д — http://localhost дээрх dev серверээс илгээх
      // нь өөртөө буудах юм.
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Express-ийн X-Powered-By fingerprint-ийг арилгана.
    res.removeHeader('X-Powered-By');
    next();
  };
}
