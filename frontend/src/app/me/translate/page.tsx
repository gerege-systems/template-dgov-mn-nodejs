import LiveTranslateView from '@/components/me/LiveTranslateView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeTranslatePage() {
  usePageTitle('Шууд орчуулга');
  return <LiveTranslateView />;
}
