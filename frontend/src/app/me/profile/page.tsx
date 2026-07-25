import ProfileView from '@/components/me/ProfileView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function MeProfilePage() {
  usePageTitle('Профайл');
  const me = useMe();
  return <ProfileView me={me} />;
}
