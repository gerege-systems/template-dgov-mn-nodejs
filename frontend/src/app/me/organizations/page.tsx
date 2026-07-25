import PageHead from '@/components/PageHead';
import OrgRepsCard from '@/components/me/OrgRepsCard';
import ImageUploadCard from '@/components/me/ImageUploadCard';
import { useMe } from '@/lib/session';
import { usePageTitle } from '@/lib/usePageTitle';


export default function MeOrganizationsPage() {
  usePageTitle('Байгууллага');
  const me = useMe();

  return (
    <>
      <PageHead eyebrowKey="sys.user" titleKey="org.title" subKey="org.sub" />
      {/* eID-д бүртгэлтэй, төлөөлдөг байгууллагууд (eidmongolia.mn) */}
      <OrgRepsCard show={!!me.eid} />
      {/* Хувь хүний гарын үсгийн зураг (Google Drive-д хадгална). */}
      <ImageUploadCard
        titleKey="me.assets.signatureTitle"
        hintKey="me.assets.signatureHint"
        path="/me/signature"
        queryKey={['my-signature']}
        canEdit
      />
    </>
  );
}
