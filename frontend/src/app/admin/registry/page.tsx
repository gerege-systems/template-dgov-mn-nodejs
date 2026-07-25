import PageHead from '@/components/PageHead';
import RegistryOverviewView from '@/components/registry/RegistryOverviewView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('Үйлчилгээний регистр — Ring System');
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryOverview" subKey="registry.overview.sub" />
      <RegistryOverviewView />
    </>
  );
}
