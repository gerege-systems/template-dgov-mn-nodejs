import PageHead from '@/components/PageHead';
import DashboardCards from '@/components/DashboardCards';
import { usePermissions } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function ManagerDashboardPage() {
  usePageTitle('Менежер — Хяналтын самбар');
  const perms = usePermissions();

  return (
    <>
      <PageHead eyebrowKey="sys.manager" titleKey="nav.managerDashboard" subKey="manager.dashboard.sub" />
      <DashboardCards set="manager" perms={perms} />
    </>
  );
}
