import PageHead from '@/components/PageHead';
import RegistryEvidencesView from '@/components/registry/RegistryEvidencesView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('Нотолгооны каталог — Ring System');
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryEvidences" subKey="registry.evidences.sub" />
      <RegistryEvidencesView />
    </>
  );
}
