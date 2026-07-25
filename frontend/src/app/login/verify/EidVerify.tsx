"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import Alert from '@/components/Alert';
import { postJSON } from '@/lib/client';
import { safeNext } from '@/lib/navigation';
import { useT } from '@/lib/lang';

type Phase = 'checking' | 'success' | 'expired' | 'refused' | 'error';

const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 2500;

// App2App-ийн дараа eID апп-аас буцаж ирэх callback. session id-г хэдэн удаа
// poll хийж, COMPLETE бол /me/dashboard (эсвэл next) руу шилжинэ.
export default function EidVerify({ sessionId, next }: { sessionId: string; next: string }) {
  const router = useRouter();
  const { T } = useT();
  const [phase, setPhase] = useState<Phase>('checking');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const target = next && next !== '/' ? next : '/me/dashboard';

    const tick = async () => {
      attempts += 1;
      const res = await postJSON<{ state?: string }>('/api/auth/eid/poll', { session_id: sessionId });
      if (!mounted.current) return;

      if (res.ok) {
        const state = res.data?.state;
        if (state === 'COMPLETE') {
          setPhase('success');
          router.push(safeNext(target));
          router.refresh();
          return;
        }
        if (state === 'EXPIRED') {
          setPhase('expired');
          return;
        }
        if (state === 'REFUSED') {
          setPhase('refused');
          return;
        }
      }

      if (attempts >= MAX_ATTEMPTS) {
        setPhase(res.ok ? 'expired' : 'error');
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      mounted.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, next, router]);

  return (
    <div className="form-grid" aria-live="polite">
      {phase === 'checking' && (
        <p
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--muted)',
            fontSize: 14,
          }}
        >
          <ShieldCheck size={16} strokeWidth={2} />
          <span>{T('auth.eid.waiting')}</span>
        </p>
      )}
      {phase === 'success' && <Alert kind="success">{T('auth.eid.success')}</Alert>}
      {phase === 'expired' && <Alert kind="info">{T('auth.eid.expired')}</Alert>}
      {phase === 'refused' && <Alert kind="danger">{T('auth.eid.refused')}</Alert>}
      {phase === 'error' && <Alert kind="danger">{T('auth.eid.startError')}</Alert>}

      {(phase === 'expired' || phase === 'refused' || phase === 'error') && (
        <button
          className="btn btn--primary btn--lg btn--block"
          type="button"
          onClick={() => router.push('/login')}
        >
          <RefreshCw size={18} strokeWidth={2} />
          <span>{T('auth.eid.retry')}</span>
        </button>
      )}
    </div>
  );
}
