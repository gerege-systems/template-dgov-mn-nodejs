// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHead from '@/components/PageHead';
import IntegrationsView from '@/components/me/IntegrationsView';
import { getJSON } from '@/lib/client';
import { integrationStatuses } from '@/lib/integrations';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * Холбогдсон интеграцийн ЖАГСААЛТ (токен БИШ) — токен нь ЖС-д хэзээ ч
 * хүрэхгүй, зөвхөн ямар провайдер холбогдсоныг харуулна.
 */
export default function IntegrationsPage(): React.ReactElement {
  usePageTitle('Интеграци');
  const me = useMe();
  const list = useQuery({
    queryKey: ['integrations'],
    queryFn: () => getJSON<{ provider: string }[]>('/integrations'),
    retry: false,
  });

  const connected = new Set<string>((list.data ?? []).map((x) => x.provider));
  const items = integrationStatuses(connected);
  // Google Login нь токен биш, identity холболт (users.google_sub) — төлөв нь
  // session дээрх google блок.
  const google = {
    configured: true,
    connected: Boolean(me.google),
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
