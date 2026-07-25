import HomeView from '@/components/me/HomeView';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function MeDashboardPage() {
  usePageTitle('Хяналтын самбар');
  const me = useMe();
  return <HomeView me={me} />;
}
