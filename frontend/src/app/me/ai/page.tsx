import React from 'react';
import { redirect } from 'next/navigation';
import AiChatView from '@/components/me/AiChatView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI туслах — Government Template Platform V3.0' };

export default async function MeAiPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/ai');
  return <AiChatView />;
}
