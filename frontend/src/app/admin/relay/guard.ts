import 'server-only';
import { redirect } from 'next/navigation';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

// requireRelayAccess нь /admin/relay/* хуудас бүрийн серверийн талын хамгаалалт —
// нэвтрээгүй эсвэл 'relay.view' эрхгүй бол нүүр рүү буцаана. (Backend route мөн
// адил баталгаажуулдаг — энэ нь UI түвшний хаалт.)
export async function requireRelayAccess(): Promise<void> {
  const me = await fetchMe();
  if (!me) redirect('/');
  const perms = await fetchMyPermissions();
  if (!perms.includes('relay.view')) redirect('/');
}
