import PageHead from '@/components/PageHead';
import EidLogsView from '@/components/me/eid/EidLogsView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function EidLogsPage() {
  usePageTitle('Үйл ажиллагаа');
  const me = useMe();
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.logs.title" subKey="eid.logs.sub" />
      <EidLogsView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
