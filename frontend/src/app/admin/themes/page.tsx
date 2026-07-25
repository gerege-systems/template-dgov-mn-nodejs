import PageHead from '@/components/PageHead';
import ThemeManager from '@/components/admin/ThemeManager';

import { usePageTitle } from '@/lib/usePageTitle';


export default function AdminThemesPage() {
  usePageTitle('Landing theme — Админ');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="themes.title" subKey="themes.sub" />
      <ThemeManager />
    </>
  );
}
