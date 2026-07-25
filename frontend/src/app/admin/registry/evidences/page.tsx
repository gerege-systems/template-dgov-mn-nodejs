import React from 'react';
import PageHead from '@/components/PageHead';
import RegistryEvidencesView from '@/components/registry/RegistryEvidencesView';
import { requireRegistryAccess } from '../guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Нотолгооны каталог — Ring System' };

export default async function Page() {
  await requireRegistryAccess();
  return (
    <>
      <PageHead eyebrowKey="group.registry" titleKey="nav.registryEvidences" subKey="registry.evidences.sub" />
      <RegistryEvidencesView />
    </>
  );
}
