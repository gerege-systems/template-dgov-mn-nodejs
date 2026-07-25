import PageHead from '@/components/PageHead';
import ApplicationsView from '@/components/applications/ApplicationsView';
import { usePageTitle } from '@/lib/usePageTitle';


export default function Page() {
  usePageTitle('Applications');
  return (
    <>
      <PageHead eyebrowKey="group.gateway" titleKey="nav.applications" subKey="apps.sub" />
      <ApplicationsView />
    </>
  );
}
