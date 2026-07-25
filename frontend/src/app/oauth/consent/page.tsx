// eID based AI enabled Government Template Platform V3.0
// OIDC provider consent хуудас — Hydra нь consent_challenge-тэй энд чиглүүлнэ.
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import ConsentClient from './ConsentClient';

export const dynamic = 'force-dynamic';

export default async function OAuthConsentPage(props: {
  searchParams: Promise<{ consent_challenge?: string }>;
}) {
  const { consent_challenge: challenge } = await props.searchParams;
  if (!challenge) redirect('/');
  const token = await getAccessToken();
  if (!token) {
    const ret = `/oauth/consent?consent_challenge=${encodeURIComponent(challenge)}`;
    redirect(`/login?next=${encodeURIComponent(ret)}`);
  }
  return (
    <section className="signin-card" aria-labelledby="consent-title">
      <ConsentClient challenge={challenge} />
    </section>
  );
}
