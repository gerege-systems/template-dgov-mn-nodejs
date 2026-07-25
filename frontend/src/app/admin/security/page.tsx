import PageHead from '@/components/PageHead';
import SecurityViewer from '@/components/admin/SecurityViewer';
import { isAdminLevel } from '@/lib/types';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';
import { Navigate } from 'react-router-dom';


export default function AdminSecurityPage() {
  usePageTitle('Аюулгүй байдал — Админ');
  const me = useMe();
  if (!isAdminLevel(me.roleId)) return <Navigate to='/' replace />;

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="security.title" subKey="security.sub" />
      <SecurityViewer />
    </>
  );
}
