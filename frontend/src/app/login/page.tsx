// Government Template Platform V3.0
// Gerege Systems Development Team & Claude AI, 2026
import { LogIn } from 'lucide-react';
import SigninShell from '@/components/SigninShell';
import { safeNext } from '@/lib/navigation';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/lib/usePageTitle';
import { startSSOLogin } from '@/lib/authFlows';



// Нэвтрэлт нь Government SSO (sso.dgov.mn)-оор дамжина. Товч дарахад sso.dgov.mn
// руу шилжиж, тэндээ нэвтэрч, буцаж ирнэ (OIDC RP урсгал). SSO callback амжилтгүй
// бол энд ?error=sso-тэй буцаж, дахин оролдох боломж өгнө.
export default function LoginPage() {
  usePageTitle('Нэвтрэх');
  const [searchParams] = useSearchParams();
  const next = safeNext((searchParams.get('next') ?? undefined));
  const startSso = () => void startSSOLogin(next);
  const failed = (searchParams.get('error') ?? undefined) === 'sso';

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
          onClick={startSso}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <LogIn size={18} strokeWidth={2} />
          <span>Government SSO-оор нэвтрэх</span>
        </a>
      </section>
    </SigninShell>
  );
}
