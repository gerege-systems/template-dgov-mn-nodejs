import PageHead from '@/components/PageHead';
import CoreSearchView from '@/components/admin/CoreSearchView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function AdminCorePage() {
  usePageTitle('Core хайлт — Админ');
  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.coreSearch" subKey="core.search.sub" />
      <CoreSearchView />
    </>
  );
}
