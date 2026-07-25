// Government Template Platform V3.0
// Gerege Systems Development Team & Claude AI, 2026
import React from 'react';
import { LogIn } from 'lucide-react';
import SigninShell from '@/components/SigninShell';
import { safeNext } from '@/lib/navigation';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Нэвтрэх — Government Template Platform V3.0' };

// Нэвтрэлт нь Government SSO (sso.dgov.mn)-оор дамжина. Товч дарахад sso.dgov.mn
// руу шилжиж, тэндээ нэвтэрч, буцаж ирнэ (OIDC RP урсгал). SSO callback амжилтгүй
// бол энд ?error=sso-тэй буцаж, дахин оролдох боломж өгнө.
export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const next = safeNext(searchParams.next);
  const ssoHref = `/api/auth/sso/start${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
  const failed = searchParams.error === 'sso';

  return (
    <SigninShell>
      <section
        className="signin-card"
        aria-labelledby="login-title"
        style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
      >
        <div>
          <h1 id="login-title" style={{ margin: '0 0 0.4rem' }}>Нэвтрэх</h1>
          <p style={{ margin: 0, opacity: 0.7 }}>Government SSO (sso.dgov.mn)-оор нэвтэрнэ үү.</p>
        </div>

        {failed && (
          <p
            role="alert"
            style={{
              margin: 0,
              color: '#b42318',
              background: 'rgba(180,35,24,0.08)',
              padding: '0.6rem 0.9rem',
              borderRadius: 10,
              fontSize: '0.9rem',
            }}
          >
            Нэвтрэлт амжилтгүй боллоо. Дахин оролдоно уу.
          </p>
        )}

        <a
          className="btn btn--eid btn--lg btn--block"
          href={ssoHref}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <LogIn size={18} strokeWidth={2} />
          <span>Government SSO-оор нэвтрэх</span>
        </a>
      </section>
    </SigninShell>
  );
}
