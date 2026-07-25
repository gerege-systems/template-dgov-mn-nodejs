import PageHead from '@/components/PageHead';
import RegistryServicesView from '@/components/registry/RegistryServicesView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('Үйлчилгээний паспорт — Ring System');
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryServices" subKey="registry.services.sub" />
      <RegistryServicesView />
    </>
  );
}
