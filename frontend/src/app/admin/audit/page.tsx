import PageHead from '@/components/PageHead';
import AuditViewer from '@/components/admin/AuditViewer';
import { isAdminLevel } from '@/lib/types';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';
import { Navigate } from 'react-router-dom';


export default function AdminAuditPage() {
  usePageTitle('Аудит лог — Админ');
  const me = useMe();
  if (!isAdminLevel(me.roleId)) return <Navigate to='/' replace />;

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="audit.title" subKey="audit.sub" />
      <AuditViewer />
    </>
  );
}
