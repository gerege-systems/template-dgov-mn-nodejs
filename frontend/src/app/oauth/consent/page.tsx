// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { useSession } from '@/lib/session';
import ConsentClient from './ConsentClient';

/**
 * OIDC зөвшөөрлийн хуудас. Challenge-гүй бол нүүр рүү; нэвтрээгүй бол нэвтрэх
 * хуудас руу (буцаад энэ challenge дээрээ ирнэ).
 */
export default function OAuthConsentPage(): React.ReactElement | null {
  const [searchParams] = useSearchParams();
  const { me, loading } = useSession();
  const challenge = searchParams.get('consent_challenge') ?? '';

  if (!challenge) return <Navigate to="/" replace />;
  if (loading) return null;
  if (!me) {
    const ret = `/oauth/consent?consent_challenge=${encodeURIComponent(challenge)}`;
    return <Navigate to={`/login?next=${encodeURIComponent(ret)}`} replace />;
  }

  return (
    <section className="signin-card" aria-labelledby="consent-title">
      <ConsentClient challenge={challenge} />
    </section>
  );
}
