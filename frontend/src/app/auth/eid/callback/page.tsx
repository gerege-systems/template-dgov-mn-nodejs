'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJSON } from '@/lib/client';

// Платформ стандарт App2App буцах цэг — `/auth/eid/callback`.
//
// SAME-DEVICE (mobile browser) урсгалд утас approve хийсний дараа eID app browser-ийг ЭНД
// `?sessionId=<id>`-тэй буцаана. sessionId-оор session poll хийж, COMPLETE-д нэвтрэлт дуусгаж
// нүүр рүү шилжинэ. eID backend бүх RP-ийн callback-ийг энэ зам руу force-normalize хийдэг тул
// буцах цэг стандарт. CROSS-DEVICE (desktop QR/push) урсгалд энэ хуудас ОГТ дуудагдахгүй — эх
// browser байрандаа poll хийж нэвтэрдэг.
export default function EidCallbackPage() {
  const router = useRouter();
  const [err, setErr] = useState('');

  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('sessionId');
    if (!sid) {
      setErr('Session олдсонгүй');
      return;
    }
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const res = await postJSON<{ state?: string }>('/api/auth/eid/poll', { session_id: sid });
      if (stopped || !res.ok) return;
      const state = res.data?.state;
      if (state === 'COMPLETE') {
        stopped = true;
        router.replace('/'); // backend poll COMPLETE-д session cookie тавьсан — нэвтэрлээ
        router.refresh();
      } else if (state === 'EXPIRED' || state === 'REFUSED') {
        stopped = true;
        setErr('Нэвтрэлт дуусгагдсангүй. Дахин оролдоно уу.');
      }
      // RUNNING — үргэлжлүүлэн хүлээнэ.
    };

    const timer = setInterval(tick, 2000);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  return (
    <main style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      {err ? (
        <>
          <p>{err}</p>
          <p>
            <a href="/login">← Нэвтрэх хуудас руу буцах</a>
          </p>
        </>
      ) : (
        <p>Нэвтрэлтийг үргэлжлүүлж байна…</p>
      )}
    </main>
  );
}
