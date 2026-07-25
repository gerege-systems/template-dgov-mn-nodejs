import PageHead from '@/components/PageHead';
import EidSignView from '@/components/me/eid/EidSignView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function EidSignPage() {
  usePageTitle('Гарын үсэг зурах');
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.sign.title" subKey="eid.sign.sub" />
      <EidSignView />
    </>
  );
}
