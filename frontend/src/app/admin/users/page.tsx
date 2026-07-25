import PageHead from '@/components/PageHead';
import UsersManager from '@/components/admin/UsersManager';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function AdminUsersPage() {
  usePageTitle('Хэрэглэгчид — Админ');
  const me = useMe();

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.users" subKey="admin.users.sub" />
      <UsersManager currentUserId={me.id} currentUserRoleId={me.roleId} />
    </>
  );
}
