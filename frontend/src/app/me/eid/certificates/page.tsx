import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import EidCertificatesView from '@/components/me/eid/EidCertificatesView';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Гэрчилгээ — Government Template Platform V3.0' };

export default async function EidCertificatesPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/eid/certificates');
  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="eid.certs.title" subKey="eid.certs.sub" />
      <EidCertificatesView show={!!me.eid || !!me.eidProxy} />
    </>
  );
}
