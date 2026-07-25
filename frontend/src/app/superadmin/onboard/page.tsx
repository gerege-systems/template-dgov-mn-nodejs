import SigninShell from '@/components/SigninShell';
import OnboardWizard from '@/components/superadmin/OnboardWizard';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/lib/usePageTitle';



// Нийтийн (auth-гүй) invite-gated superadmin онбординг wizard. Google callback
// нь энэ хуудсанд ?code= (амжилт) эсвэл ?gerror= (алдаа) буцаана.
export default function SuperadminOnboardPage() {
  usePageTitle('Супер админ бүртгэл');
  const [searchParams] = useSearchParams();

  return (
    <SigninShell>
      <section className="signin-card" aria-labelledby="onboard-title">
        <OnboardWizard code={(searchParams.get('code') ?? undefined)} gerror={(searchParams.get('gerror') ?? undefined)} />
      </section>
    </SigninShell>
  );
}
