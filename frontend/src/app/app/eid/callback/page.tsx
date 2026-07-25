'use client';

import React, { useEffect } from 'react';

// eID App2App буцах "bridge" хуудас. eID платформ callback-ийг заавал https +
// allowlist host (sso.dgov.mn) байхыг шаарддаг тул native апп custom
// scheme-ээ шууд өгч чадахгүй. Энэ хуудас руу буцаад, эндээс native апп
// (geregetemp://eid/callback) руу үсэрч TemplateApp-ыг нээнэ.
export const dynamic = 'force-dynamic';

const APP_URL = 'geregetemp://eid/callback';

export default function AppEidCallbackBridge() {
  useEffect(() => {
    // Апп руу шууд үсэрнэ (нээгдээгүй бол хэрэглэгч доорх товчоор).
    window.location.href = APP_URL;
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24,
        fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48 }}>✅</div>
      <h1 style={{ fontSize: 20, margin: 0 }}>Баталгаажлаа</h1>
      <p style={{ color: '#666', margin: 0, maxWidth: 320, lineHeight: 1.5 }}>
        Аппликейшн руу буцаж байна… Автоматаар нээгдэхгүй бол доорх товчийг дарна уу.
      </p>
      <a
        href={APP_URL}
        style={{
          background: '#2563eb', color: '#fff', padding: '12px 24px',
          borderRadius: 12, textDecoration: 'none', fontWeight: 600,
        }}
      >
        Апп руу буцах
      </a>
    </main>
  );
}
