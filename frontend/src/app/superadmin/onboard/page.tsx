import React from 'react';
import SigninShell from '@/components/SigninShell';
import OnboardWizard from '@/components/superadmin/OnboardWizard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Супер админ бүртгэл — Government Template Platform V3.0' };

// Нийтийн (auth-гүй) invite-gated superadmin онбординг wizard. Google callback
// нь энэ хуудсанд ?code= (амжилт) эсвэл ?gerror= (алдаа) буцаана.
export default async function SuperadminOnboardPage(props: {
  searchParams: Promise<{ code?: string; gerror?: string }>;
}) {
  const searchParams = await props.searchParams;

  return (
    <SigninShell>
      <section className="signin-card" aria-labelledby="onboard-title">
        <OnboardWizard code={searchParams.code} gerror={searchParams.gerror} />
      </section>
    </SigninShell>
  );
}
