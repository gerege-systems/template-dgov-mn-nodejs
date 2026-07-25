import PageHead from '@/components/PageHead';
import OrgManageView from '@/components/me/OrgManageView';
import { useParams } from 'react-router-dom';

import { usePageTitle } from '@/lib/usePageTitle';


// eID-д бүртгэлтэй, төлөөлдөг байгууллагын удирдах дэлгэц (гарын үсэг зурагч + салгах).
export default function MeEidOrgManagePage() {
  usePageTitle('Байгууллага');
  const params = useParams();
  const routeId = params.id ?? params.regNo ?? '';

  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="org.title" subKey="org.detail" />
      <OrgManageView regNo={decodeURIComponent(routeId)} />
    </>
  );
}
