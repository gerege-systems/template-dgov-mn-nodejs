import PageHead from '@/components/PageHead';
import GovServicesView from '@/components/gov/GovServicesView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeServicesPage() {
  usePageTitle('Үйлчилгээ');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govServices" subKey="gov.services.sub" />
      <GovServicesView />
    </>
  );
}
