import React from 'react';
import { Inter, JetBrains_Mono, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { LangProvider } from '@/lib/lang';
import Providers from '@/components/Providers';
import { fetchActiveTheme } from '@/lib/api';

// Фонтыг build үед татаж next/font өөрөө host хийдэг тул CSP-г чанд 'self'-ээр
// үлдээж болно (гадны фонт host хэрэггүй).
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display-stack',
  display: 'swap',
});

const interBody = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body-stack',
  display: 'swap',
});

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-stack',
  display: 'swap',
});

// Сонголттой serif гэр бүл — html[data-font="serif"] үед --font-serif-stack-аар
// display/body-д тэжээгдэнэ. next/font build-time host хийдэг тул CSP 'self' хэвээр.
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-serif-stack',
  display: 'swap',
});

export const metadata = {
  title: 'Government Template Platform V3.0',
  description:
    'eID based, AI enabled. Government Template Platform V3.0 — chi (net/http) + pgx дээр суурилсан, төрийн аливаа цахим үйлчилгээг дээр нь босгох, үйлдвэрлэлд бэлэн суурь: eID нэвтрэлт, SSO/OIDC, Gemini AI, аюулгүй байдлын хатуужуулалт нэг дороос.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Админы сайт-харагдацыг client рүү дамжуулна. Үүнийг ЗӨВХӨН нийтийн хуудсанд
  // (landing/login) хэрэглэнэ — хэрэглэх/эс хэрэглэхийг theme-bootstrap.js зам
  // (pathname) харгалзан шийднэ. SSR-д <html>-д bake хийхгүй: нэвтэрсэн апп-д
  // админ утга анивчихаас сэргийлнэ; блоклогч bootstrap FOUC-ийг хамгаална.
  // Утгууд backend-д баталгаажсан (preset/hex/enum) тул аюулгүй; '<'-г escape
  // хийж </script> тасалдлаас сэргийлнэ.
  const theme = await fetchActiveTheme();
  const appearance = theme.appearance ?? {};
  const siteJson = JSON.stringify(appearance).replace(/</g, '\\u003c');

  return (
    <html
      lang="mn"
      className={`${inter.variable} ${interBody.variable} ${jbMono.variable} ${sourceSerif.variable}`}
      // theme-bootstrap.js нь hydration-аас өмнө <html>-д data-* тавьдаг тул
      // server/client attribute зөрүүгийн warning-ийг дарна.
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" type="image/webp" href="/brand.webp" />
        {/* Идэвхтэй landing theme-ийн харагдац (зөвхөн нийтийн хуудсанд bootstrap хэрэглэнэ). */}
        <script dangerouslySetInnerHTML={{ __html: `window.__SITE_THEME__=${siteJson};` }} />
        {/* FOUC-аас сэргийлэх — гадаад блоклогч script (public/theme-bootstrap.js).
            Статик, адил-origin, 0.5KB файл тул XSS / гуравдагч талын эрсдэлгүй;
            body зурахаас ӨМНӨ ажиллах ёстой тул async/defer хийхгүй (эс бөгөөс
            загвар анивчина). Иймд no-sync-scripts дүрмийг энд зориуд унтраав. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-bootstrap.js" />
      </head>
      <body><Providers><LangProvider>{children}</LangProvider></Providers></body>
    </html>
  );
}
