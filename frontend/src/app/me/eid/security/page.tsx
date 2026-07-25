import PageHead from '@/components/PageHead';
import EidSecurityView from '@/components/me/eid/EidSecurityView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function EidSecurityPage() {
  usePageTitle('eID аюулгүй байдал');
  const me = useMe();
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.security.title" subKey="eid.security.sub" />
      <EidSecurityView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
