import React from 'react';
import PageHead from '@/components/PageHead';
import RegistryOverviewView from '@/components/registry/RegistryOverviewView';
import { requireRegistryAccess } from './guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Үйлчилгээний регистр — Ring System' };

export default async function Page() {
  await requireRegistryAccess();
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryOverview" subKey="registry.overview.sub" />
      <RegistryOverviewView />
    </>
  );
}
