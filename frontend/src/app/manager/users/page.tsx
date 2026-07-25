import PageHead from '@/components/PageHead';
import UsersManager from '@/components/admin/UsersManager';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function ManagerUsersPage() {
  usePageTitle('Хэрэглэгчид — Менежер');
  const me = useMe();

  return (
    <>
      <PageHead eyebrowKey="sys.manager" titleKey="nav.users" subKey="manager.users.sub" />
      <UsersManager currentUserId={me.id} currentUserRoleId={me.roleId} />
    </>
  );
}
