import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import ThemeManager from '@/components/admin/ThemeManager';
import { fetchMe, fetchMyPermissions } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Landing theme — Админ' };

export default async function AdminThemesPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/admin/themes');
  const perms = await fetchMyPermissions();
  if (!perms.includes('settings.manage')) redirect('/');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="themes.title" subKey="themes.sub" />
      <ThemeManager />
    </>
  );
}
