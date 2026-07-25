import PageHead from '@/components/PageHead';
import SettingsNote from '@/components/admin/SettingsNote';
import AiPromptsManager from '@/components/admin/AiPromptsManager';

import { usePageTitle } from '@/lib/usePageTitle';


export default function AdminSettingsPage() {
  usePageTitle('Тохиргоо — Админ');

  return (
    <>
      <PageHead eyebrowKey="sys.admin" titleKey="nav.settings" subKey="admin.settings.sub" />
      <AiPromptsManager />
      <SettingsNote />
    </>
  );
}
