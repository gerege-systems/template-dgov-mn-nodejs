import PageHead from '@/components/PageHead';
import DashboardCards from '@/components/DashboardCards';
import { usePermissions } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function AdminDashboardPage() {
  usePageTitle('Админ — Хяналтын самбар');
  const perms = usePermissions();

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.dashboard" subKey="admin.dashboard.sub" />
      <DashboardCards set="admin" perms={perms} />
    </>
  );
}
