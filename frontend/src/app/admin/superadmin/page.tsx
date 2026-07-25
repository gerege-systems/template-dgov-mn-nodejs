import PageHead from '@/components/PageHead';
import SuperadminManager from '@/components/admin/SuperadminManager';
import AccessModeCard from '@/components/superadmin/AccessModeCard';
import { isSuperAdmin } from '@/lib/types';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';
import { Navigate } from 'react-router-dom';


export default function SuperadminPage() {
  usePageTitle('Супер админ — Админуудыг удирдах');
  const me = useMe();
  // Зөвхөн super admin — энгийн admin ч хандахгүй (least-privilege).
  if (!isSuperAdmin(me.roleId)) return <Navigate to='/' replace />;

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.superadmin" subKey="superadmin.sub" />
      <AccessModeCard />
      <SuperadminManager currentUserId={me.id} />
    </>
  );
}
