// eID based AI enabled Government Template Platform V3.0
// OIDC provider (RP-facing) login хуудас — Hydra нь browser-ыг энд login_challenge-
// тэй чиглүүлнэ. dan-ий ӨӨРИЙН дизайнаар (SigninShell + LoginForm: eID РД/QR +
// Google) нэвтрүүлж, буцаж ирэхэд challenge-ыг accept хийнэ. Дээр талд аль RP-ээс
// нэвтэрч буйг (client_name) харуулна.
import { redirect } from 'next/navigation';
import { getAccessToken } from '@/lib/session';
import { backendFetch } from '@/lib/api';
import LoginForm from '@/app/login/LoginForm';
import AcceptClient from './AcceptClient';

export const dynamic = 'force-dynamic';

export default async function OAuthLoginPage(props: {
  searchParams: Promise<{ login_challenge?: string; glink?: string; gerror?: string }>;
}) {
  const sp = await props.searchParams;
  const challenge = sp.login_challenge;
  if (!challenge) redirect('/');
  const hasSession = !!(await getAccessToken());
  const next = `/oauth/login?login_challenge=${challenge}`;

  // Аль RP-ээс нэвтэрч буйг server талд авна (GetLogin — auth шаардахгүй).
  let rpName = '';
  const info = await backendFetch<{ ClientName?: string; ClientID?: string }>(
    `/provider/login?login_challenge=${encodeURIComponent(challenge)}`,
    { method: 'GET' },
  );
  if (info.ok && info.data) rpName = info.data.ClientName || info.data.ClientID || '';

  return (
    <section className="signin-card" aria-labelledby="login-title">
      {rpName && (
        <div
          style={{
            marginBottom: 4,
            paddingBottom: 14,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>
            {rpName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
            Government SSO — нэгдсэн нэвтрэлтээр нэвтрэх гэж байна
          </div>
        </div>
      )}
      {hasSession ? (
        <AcceptClient challenge={challenge} />
      ) : (
        <LoginForm next={next} googleLink={sp.glink === '1'} googleError={!!sp.gerror} />
      )}
    </section>
  );
}
