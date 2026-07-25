import React from 'react';
import { redirect } from 'next/navigation';
import ProfileView from '@/components/me/ProfileView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Профайл — Government Template Platform V3.0' };

export default async function MeProfilePage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/profile');
  return <ProfileView me={me} />;
}
