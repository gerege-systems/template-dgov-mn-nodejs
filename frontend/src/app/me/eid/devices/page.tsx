import PageHead from '@/components/PageHead';
import EidDevicesView from '@/components/me/eid/EidDevicesView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function EidDevicesPage() {
  usePageTitle('Төхөөрөмж');
  const me = useMe();
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.devices.title" subKey="eid.devices.sub" />
      <EidDevicesView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
