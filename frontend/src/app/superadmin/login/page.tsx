import SigninShell from '@/components/SigninShell';
import { safeNext } from '@/lib/navigation';
import LoginForm from '@/app/login/LoginForm';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/lib/usePageTitle';



// Superadmin нэвтрэлт — Google / eID сонголт нь ердийн LoginForm-той адил.
// MFA-той superadmin бол backend session-ий оронд MFA gate буцаана; LoginForm
// (eID poll) эсвэл Google callback (?mfa=1) TOTP/recovery challenge руу шилжүүлнэ.
// Амжилттай нэвтэрмэгц /admin/dashboard руу.
export default function SuperadminLoginPage() {
  usePageTitle('Супер админ нэвтрэх');
  const [searchParams] = useSearchParams();
  const next = safeNext((searchParams.get('next') ?? undefined) ?? '/admin/dashboard');

  return (
    <SigninShell>
      <section className="signin-card" aria-labelledby="login-title">
        <LoginForm
          next={next}
          googleError={!!(searchParams.get('gerror') ?? undefined)}
          mfaGate={(searchParams.get('mfa') ?? undefined) === '1'}
        />
      </section>
    </SigninShell>
  );
}
