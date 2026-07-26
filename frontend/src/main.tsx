// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { createRoot } from 'react-dom/client';

// Фонтууд — ӨӨРӨӨ HOST хийгддэг (Google Fonts CDN БИШ). Next.js хувилбарт
// үүнийг `next/font` хийдэг байсан; Vite-д fontsource нь ижил үүрэг гүйцэтгэнэ:
// woff2 файлууд bundle-д багтаж `/assets/`-аас өгөгдөнө. Ингэснээр CSP-ийн
// `font-src 'self'` чанд хэвээр үлдэж, гуравдагч талын хост руу хүсэлт
// явуулахгүй (хэрэглэгчийн IP гадагш алдагдахгүй).
//
// `index.css` нь КИРИЛЛ subset-ийг агуулна — монгол текст зөв гарахад ЗААВАЛ.
// Variable фонт тул 100–900 жин нэг файлаас гарна (эх хувилбарын 400/500/600/700
// гэсэн 4 статик файлыг орлоно).
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/source-serif-4';

import App from './App';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root элемент олдсонгүй');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
