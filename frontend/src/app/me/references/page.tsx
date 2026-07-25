import PageHead from '@/components/PageHead';
import GovReferencesView from '@/components/gov/GovReferencesView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeReferencesPage() {
  usePageTitle('Лавлагаа');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govReferences" subKey="gov.references.sub" />
      <GovReferencesView />
    </>
  );
}
