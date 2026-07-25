import React from 'react';
import PageHead from '@/components/PageHead';
import RegistryServiceDetailView from '@/components/registry/RegistryServiceDetailView';
import { requireRegistryAccess } from '../../guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Паспортын дэлгэрэнгүй — Ring System' };

export default async function Page(props: { params: Promise<{ id: string }> }) {
  await requireRegistryAccess();
  const { id } = await props.params;
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryServices" subKey="registry.detail.sub" />
      <RegistryServiceDetailView id={id} />
    </>
  );
}
