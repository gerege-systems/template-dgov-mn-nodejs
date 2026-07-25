import { authedFetch } from '@/lib/api';
import { proxyResult } from '@/lib/bff';

export const dynamic = 'force-dynamic';

// GET /api/gov/life-events — амьдралын/бизнесийн үйл явдлын каталог.
// Мастер нь registry_life_events (migration 47); gov endpoint нь иргэний
// порталд зориулж ЕХ-ны кодтой нь хамт буцаана.
export async function GET() {
  return proxyResult(await authedFetch('/gov/life-events', { method: 'GET' }));
}
