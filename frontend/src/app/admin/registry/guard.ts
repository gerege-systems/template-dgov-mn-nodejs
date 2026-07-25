import 'server-only';
import { redirect } from 'next/navigation';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

// requireRegistryAccess нь /admin/registry/* хуудас бүрийн серверийн талын
// хамгаалалт — нэвтрээгүй эсвэл 'registry.view' эрхгүй бол нүүр рүү буцаана.
// (Backend route мөн адил баталгаажуулдаг — энэ нь UI түвшний хаалт.)
export async function requireRegistryAccess(): Promise<void> {
  const me = await fetchMe();
  if (!me) redirect('/');
  const perms = await fetchMyPermissions();
  if (!perms.includes('registry.view')) redirect('/');
}
