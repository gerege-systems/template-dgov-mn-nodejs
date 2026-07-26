// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { postJSON } from '@/lib/client';
import { useRefreshData } from '@/lib/refresh';

// Government SSO (sso.dgov.mn)-д БҮРТГЭГДСЭН redirect_uri —
// `https://<origin>/sso/callback`. Иргэн SSO дээр нэвтэрсний дараа browser-ыг
// ЭНД `?code=…&state=…`-тэй буцаана (энгийн GET навигаци).
//
// ЯАГААД ЭНЭ ХУУДАС ЗААВАЛ ХЭРЭГТЭЙ ВЭ: Next.js хувилбарт энэ замыг BFF-ийн
// route handler барьж авдаг байсан. SPA-д server тал байхгүй тул зам нь SPA-ийн
// fallback руу унаж, маршрутын хүснэгтэд байхгүй бол catch-all нүүр рүү
// шилжүүлээд `code` АЛДАГДАНА — нэвтрэлт чимээгүй бүтэлгүйтэнэ.
//
// Токен нь ЖС-д хүрэхгүй: backend `POST /sso/callback` дээр code-ийг токен болгож
// солин, httpOnly cookie-г ӨӨРӨӨ тавина. Энэ хуудас зөвхөн параметрийг дамжуулж,
// үр дүнгээр нь шилжүүлнэ.
export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const refreshData = useRefreshData();
  const [failed, setFailed] = useState(false);
  // React 19-ийн StrictMode нь effect-ийг хөгжүүлэлтэд ХОЁР удаа ажиллуулна.
  // `state` нь НЭГ УДААГИЙН (backend Redis-ээс GetDel хийдэг) тул хоёр дахь
  // дуудлага үргэлж бүтэлгүйтэж, амжилттай нэвтрэлтийг алдаа мэт харуулна.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') ?? '';
    const state = params.get('state') ?? '';

    // Иргэн цуцалсан эсвэл SSO алдаа буцаасан.
    if (params.get('error') || code === '' || state === '') {
      setFailed(true);
      return;
    }

    void (async () => {
      const res = await postJSON('/sso/callback', { code, state });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      // Backend session cookie-г аль хэдийн тавьсан — session-ыг дахин уншаад
      // хэрэглэгчийн самбар руу. `replace` нь буцах товчоор code-той URL руу
      // эргэж орохоос сэргийлнэ (state аль хэдийн зарцуулагдсан).
      void refreshData();
      navigate('/me/dashboard', { replace: true });
    })();
  }, [navigate, refreshData]);

  useEffect(() => {
    if (failed) navigate('/login?error=sso', { replace: true });
  }, [failed, navigate]);

  return (
    <main style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <p>Нэвтрэлтийг баталгаажуулж байна…</p>
    </main>
  );
}
