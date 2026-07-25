import React from 'react';
import { redirect } from 'next/navigation';
import PageHead from '@/components/PageHead';
import OrgRepsCard from '@/components/me/OrgRepsCard';
import ImageUploadCard from '@/components/me/ImageUploadCard';
import { fetchMe } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Байгууллага — Government Template Platform V3.0' };

export default async function MeOrganizationsPage() {
  const me = await fetchMe();
  if (!me) redirect('/login?next=/me/organizations');

  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="org.title" subKey="org.sub" />
      {/* eID-д бүртгэлтэй, төлөөлдөг байгууллагууд (eidmongolia.mn) */}
      <OrgRepsCard show={!!me.eid} />
      {/* Хувь хүний гарын үсгийн зураг (Google Drive-д хадгална). */}
      <ImageUploadCard
        titleKey="me.assets.signatureTitle"
        hintKey="me.assets.signatureHint"
        path="/api/me/signature"
        queryKey={['my-signature']}
        canEdit
      />
    </>
  );
}
