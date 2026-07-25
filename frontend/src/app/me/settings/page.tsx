import React from 'react';
import { redirect } from 'next/navigation';
import SettingsView from '@/components/me/SettingsView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Тохиргоо — Government Template Platform V3.0' };

export default async function MeSettingsPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/settings');
  return <SettingsView />;
}
