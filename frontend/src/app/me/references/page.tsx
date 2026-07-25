import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import GovReferencesView from '@/components/gov/GovReferencesView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Лавлагаа — Government Template Platform V3.0' };

export default async function MeReferencesPage() {
  const me = await fetchMe();
  if (!me) redirect('/');
  return (
    <>
      <PageHead eyebrowKey="group.govServices" titleKey="nav.govReferences" subKey="gov.references.sub" />
      <GovReferencesView />
    </>
  );
}
