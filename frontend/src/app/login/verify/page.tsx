import React from 'react';
import { redirect } from 'next/navigation';
import SigninShell from '@/components/SigninShell';
import { safeNext } from '@/lib/navigation';
import EidVerify from './EidVerify';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'eID баталгаажуулалт — Government Template Platform V3.0' };

// eID апп-аас App2App буцалтын callback (IdP-д бүртгэгдсэн
// https://sso.dgov.mn/login/verify). eID апп буцахдаа session id-г
// нэмдэг — нийтлэг нэрсийг (sessionToken / session_id / sid) хүлээж авна.
export default async function EidVerifyPage(
  props: {
    searchParams: Promise<{ sessionToken?: string; session_id?: string; sid?: string; next?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.sessionToken || searchParams.session_id || searchParams.sid || '';
  if (!sessionId) redirect('/login');

  const next = safeNext(searchParams.next);

  return (
    <SigninShell>
      <section className="signin-card signin-card--narrow" aria-labelledby="eid-verify-title">
        <div>
          <h1 id="eid-verify-title">eID-ээр нэвтрэх</h1>
        </div>
        <EidVerify sessionId={sessionId} next={next} />
      </section>
    </SigninShell>
  );
}
