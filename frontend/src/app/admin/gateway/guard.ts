import 'server-only';
import { redirect } from 'next/navigation';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

// requireGatewayAccess нь /admin/gateway/* хуудас бүрийн серверийн талын
// хамгаалалт — нэвтрээгүй эсвэл 'gateway.manage' эрхгүй бол нүүр рүү буцаана.
// (Backend route мөн адил баталгаажуулдаг — энэ нь UI түвшний хаалт.)
export async function requireGatewayAccess(): Promise<void> {
  const me = await fetchMe();
  if (!me) redirect('/');
  const perms = await fetchMyPermissions();
  if (!perms.includes('gateway.manage')) redirect('/');
}
