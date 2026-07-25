import PageHead from '@/components/PageHead';
import EidIdView from '@/components/me/eid/EidIdView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function EidIdPage() {
  usePageTitle('eID үнэмлэх');
  const me = useMe();
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.id.title" subKey="eid.id.sub" />
      <EidIdView me={me} />
    </>
  );
}
