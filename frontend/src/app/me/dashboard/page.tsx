import React from 'react';
import { redirect } from 'next/navigation';
import HomeView from '@/components/me/HomeView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Хяналтын самбар — Government Template Platform V3.0' };

export default async function MeDashboardPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/dashboard');
  return <HomeView me={me} />;
}
