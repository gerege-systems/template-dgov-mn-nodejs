// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';

import LoginForm from '@/app/login/LoginForm';
import { getJSON } from '@/lib/client';
import { useSession } from '@/lib/session';
import AcceptClient from './AcceptClient';

/**
 * OIDC нэвтрэлтийн хуудас. Аль RP-ээс ирснийг `/provider/login`-оос уншиж
 * харуулна (энэ endpoint нэвтрэлт ШААРДАХГҮЙ — зөвхөн challenge-ийн эзэн л
 * зөв утга дуудна). Session байвал шууд зөвшөөрөх алхам руу.
 */
export default function OAuthLoginPage(): React.ReactElement | null {
  const [searchParams] = useSearchParams();
  const { me, loading } = useSession();
  const challenge = searchParams.get('login_challenge') ?? '';

  const info = useQuery({
    queryKey: ['provider', 'login', challenge],
    queryFn: () =>
      getJSON<{ ClientName?: string; ClientID?: string }>(
        `/provider/login?login_challenge=${encodeURIComponent(challenge)}`,
      ),
    enabled: challenge !== '',
    retry: false,
  });

  if (!challenge) return <Navigate to="/" replace />;
  if (loading) return null;

  const rpName = info.data?.ClientName ?? info.data?.ClientID ?? '';
  const next = `/oauth/login?login_challenge=${challenge}`;

  return (
    <section className="signin-card" aria-labelledby="login-title">
      {rpName !== '' && (
        <div
          style={{ marginBottom: 4, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>
            {rpName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
            Government SSO — нэгдсэн нэвтрэлтээр нэвтрэх гэж байна
          </div>
        </div>
      )}
      {me ? (
        <AcceptClient challenge={challenge} />
      ) : (
        <LoginForm
          next={next}
          googleLink={searchParams.get('glink') === '1'}
          googleError={searchParams.get('gerror') !== null}
        />
      )}
    </section>
  );
}
