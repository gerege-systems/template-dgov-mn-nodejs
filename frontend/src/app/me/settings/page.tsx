import SettingsView from '@/components/me/SettingsView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeSettingsPage() {
  usePageTitle('Тохиргоо');
  return <SettingsView />;
}
