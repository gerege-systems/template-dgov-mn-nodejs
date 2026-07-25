import PageHead from '@/components/PageHead';
import RolesManager from '@/components/admin/RolesManager';

import { usePageTitle } from '@/lib/usePageTitle';


export default function AdminRolesPage() {
  usePageTitle('Эрх (RBAC) — Админ');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.roles" subKey="admin.roles.sub" />
      <RolesManager />
    </>
  );
}
