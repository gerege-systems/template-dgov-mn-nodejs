import PageHead from '@/components/PageHead';
import EidCertificatesView from '@/components/me/eid/EidCertificatesView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function EidCertificatesPage() {
  usePageTitle('Гэрчилгээ');
  const me = useMe();
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.certs.title" subKey="eid.certs.sub" />
      <EidCertificatesView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
