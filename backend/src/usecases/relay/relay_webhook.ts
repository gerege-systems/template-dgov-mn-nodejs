// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Peer platform-уудтай webhook-оор харилцах давхарга — гадагш илгээх
// (deliverWebhook) болон ирснийг баталгаажуулах туслахууд. Гарын үсэг нь
// HMAC-SHA256 (JWT-гүй m2m); demo endpoint рүү гадаад дуудлага явахгүй.

import { relayIsDemoEndpoint, relaySignWebhook } from '../../domain/relay.js';
import {
  RelayWebhookEventHeader,
  RelayWebhookSigHeader,
  RelayWebhookSourceHeader,
} from '../../domain/relay.js';
import type { RelayPlatform, RelayWebhookEnvelope } from '../../domain/relay.js';
import type { Ctx } from '../../pkg/ctx/ctx.js';
import * as logger from '../../pkg/logger/logger.js';

/** webhookTimeoutMs нь peer руу илгээх HTTP дуудлагын таймаут. */
const webhookTimeoutMs = 8000;

/**
 * deliverWebhook нь envelope-ийг peer platform-ын endpoint руу HMAC гарын
 * үсэгтэй POST хийнэ. demo endpoint (хоосон/demo://) бол гадагш илгээхгүй.
 *
 * Best-effort: аливаа алдаа зөвхөн логлогдоно — webhook хүргэлт нь хэрэглэгчийн
 * хүсэлтийг УНАГАХГҮЙ (peer унасан нь бидний ingest-ийг зогсоох ёсгүй).
 */
export async function deliverWebhook(
  ctx: Ctx,
  platform: RelayPlatform,
  envelope: RelayWebhookEnvelope,
): Promise<void> {
  if (relayIsDemoEndpoint(platform.endpointUrl)) return;

  let body: Buffer;
  try {
    body = Buffer.from(JSON.stringify(envelope), 'utf8');
  } catch (err) {
    logger.errorWithContext(ctx, 'relay: marshal webhook failed', { error: logger.errText(err) });
    return;
  }

  const timeout = AbortSignal.timeout(webhookTimeoutMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  try {
    const res = await fetch(platform.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [RelayWebhookSourceHeader]: envelope.source_code,
        [RelayWebhookEventHeader]: envelope.event,
        [RelayWebhookSigHeader]: relaySignWebhook(platform.webhookSecret, body),
      },
      body,
      signal,
    });
    if (res.status >= 300) {
      logger.errorWithContext(ctx, 'relay: webhook non-2xx', {
        status: res.status,
        platform: platform.code,
      });
    }
  } catch (err) {
    logger.errorWithContext(ctx, 'relay: webhook delivery failed', {
      error: logger.errText(err),
      platform: platform.code,
    });
  }
}
