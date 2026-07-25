import PageHead from '@/components/PageHead';
import GovPaymentsView from '@/components/gov/GovPaymentsView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MePaymentsPage() {
  usePageTitle('Төлбөр');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govPayments" subKey="gov.payments.sub" />
      <GovPaymentsView />
    </>
  );
}
