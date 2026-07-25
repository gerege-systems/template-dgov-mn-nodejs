import PageHead from '@/components/PageHead';
import RegistryServiceDetailView from '@/components/registry/RegistryServiceDetailView';
import { usePageTitle } from '@/lib/usePageTitle';
import { useParams } from 'react-router-dom';


export default function Page() {
  usePageTitle('Паспортын дэлгэрэнгүй — Ring System');
  const { id = '' } = useParams();
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryServices" subKey="registry.detail.sub" />
      <RegistryServiceDetailView id={id} />
    </>
  );
}
