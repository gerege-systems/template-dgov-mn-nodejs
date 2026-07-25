import PageHead from '@/components/PageHead';
import OrgDetail from '@/components/me/OrgDetail';
import { useParams } from 'react-router-dom';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function MeOrganizationDetailPage() {
  usePageTitle('Байгууллага');
  const params = useParams();
  const routeId = params.id ?? params.regNo ?? '';
  const me = useMe();

  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="org.title" subKey="org.detail" />
      <OrgDetail orgId={routeId} currentUserId={me.id} />
    </>
  );
}
