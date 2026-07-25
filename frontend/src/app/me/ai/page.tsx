import AiChatView from '@/components/me/AiChatView';

import { usePageTitle } from '@/lib/usePageTitle';


export default function MeAiPage() {
  usePageTitle('AI туслах');
  return <AiChatView />;
}
