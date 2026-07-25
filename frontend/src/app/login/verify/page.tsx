import SigninShell from '@/components/SigninShell';
import { safeNext } from '@/lib/navigation';
import EidVerify from './EidVerify';
import { Navigate, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/lib/usePageTitle';



// eID апп-аас App2App буцалтын callback (IdP-д бүртгэгдсэн
// https://sso.dgov.mn/login/verify). eID апп буцахдаа session id-г
// нэмдэг — нийтлэг нэрсийг (sessionToken / session_id / sid) хүлээж авна.
export default function EidVerifyPage(
  
) {
  usePageTitle('eID баталгаажуулалт');
  const [searchParams] = useSearchParams();
  const sessionId = (searchParams.get('sessionToken') ?? undefined) || (searchParams.get('session_id') ?? undefined) || (searchParams.get('sid') ?? undefined) || '';
  if (!sessionId) return <Navigate to='/login' replace />;

  const next = safeNext((searchParams.get('next') ?? undefined));

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
