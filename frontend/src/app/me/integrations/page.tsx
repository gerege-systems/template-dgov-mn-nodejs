import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import IntegrationsView from '@/components/me/IntegrationsView';
import { fetchMe, authedFetch } from '@/lib/api';
import { integrationStatuses } from '@/lib/integrations';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Интеграци — Government Template Platform V3.0' };

export default async function IntegrationsPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/integrations');
  // Connected төлвийг backend-аас (хэрэглэгчийн session) уншина — токен биш,
  // зөвхөн холбосон провайдеруудын жагсаалт. Backend бэлэн болоогүй бол хоосон.
  const r = await authedFetch<{ provider: string }[]>('/integrations', { method: 'GET' });
  const connected = new Set(r.ok && Array.isArray(r.data) ? r.data.map((x) => x.provider) : []);
  const items = integrationStatuses(connected);
  // Google Login нь token биш, identity холболт (users.google_sub) — төлөв нь
  // me.google, тохируулга нь GOOGLE_CLIENT_ID env.
  const google = {
    configured: !!process.env.GOOGLE_CLIENT_ID,
    connected: !!me.google,
    email: me.google?.email ?? '',
    name: me.google?.name ?? '',
    picture: me.google?.picture ?? '',
  };
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="integrations.title" subKey="integrations.sub" />
      <IntegrationsView items={items} google={google} />
    </>
  );
}
