import React from 'react';
import PageHead from '@/components/PageHead';
import RegistryServicesView from '@/components/registry/RegistryServicesView';
import { requireRegistryAccess } from '../guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Үйлчилгээний паспорт — Ring System' };

export default async function Page() {
  await requireRegistryAccess();
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryServices" subKey="registry.services.sub" />
      <RegistryServicesView />
    </>
  );
}
