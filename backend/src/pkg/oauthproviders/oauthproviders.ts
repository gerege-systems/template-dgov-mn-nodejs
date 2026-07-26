// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/oauthproviders нь ХЭРЭГЛЭГЧИЙН гуравдагч талын үйлчилгээ (Google Drive,
// Dropbox, Google Meet) рүү холбогдох OAuth 2.0 бүртгэл юм.
//
// ⚠️ Энэ модуль нь client_secret-тэй ажилладаг тул ЗӨВХӨН сервер талд амьдарна.
// SPA нь статикаар түгээгддэг — тэнд ямар ч нууц агуулж болохгүй. Иймд authorize
// URL угсрах, authorization code солилцох, токен шинэчлэх гурвуулаа энд
// хийгддэг; browser нь зөвхөн `/integrations/:provider/connect` руу шилжинэ.
//
// ЭНЭ НЬ ПЛАТФОРМЫН НЭВТРЭЛТИЙН Google OAuth (GOOGLE_CLIENT_ID) БИШ — тэр нь
// pkg/google-д, "Google-ээр нэвтрэх"-д зориулагдсан.

import { AppConfig } from '../../config/config.js';

/** ProviderID нь дэмжигдсэн интеграцийн танигчид. */
export type ProviderID = 'google-drive' | 'dropbox' | 'google-meet';

export interface OAuthProvider {
  id: ProviderID;
  /** Брэндийн нэр (орчуулдаггүй). */
  name: string;
  /** OAuth 2.0 authorization endpoint. */
  authorizeUrl: string;
  /** OAuth 2.0 token endpoint (code → access/refresh токен). */
  tokenUrl: string;
  /** Хүсэх эрхийн хүрээ. */
  scope: string;
  /** clientId/clientSecret нь дуудах үед AppConfig-оос уншигдана. */
  clientId: () => string;
  clientSecret: () => string;
}

export const OAuthProviders: OAuthProvider[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // drive.file — апп зөвхөн ӨӨРИЙН үүсгэсэн файл/хавтсыг (Gerege folder)
    // удирдана. Хэрэглэгчийн бусад Drive-д хүрэхгүй (least privilege).
    scope: 'https://www.googleapis.com/auth/drive.file',
    clientId: () => AppConfig.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: () => AppConfig.GOOGLE_DRIVE_CLIENT_SECRET,
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    // metadata.read — /Gerege хавтсыг жагсаах; content.read/write — татах/хуулах.
    scope: 'files.content.read files.content.write files.metadata.read',
    clientId: () => AppConfig.DROPBOX_CLIENT_ID,
    clientSecret: () => AppConfig.DROPBOX_CLIENT_SECRET,
  },
  {
    id: 'google-meet',
    name: 'Google Meet',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // meetings.space.created — зөвхөн АПП ӨӨРИЙН үүсгэсэн уулзалтыг хөнднө.
    scope: 'https://www.googleapis.com/auth/meetings.space.created',
    clientId: () => AppConfig.GOOGLE_MEET_CLIENT_ID,
    clientSecret: () => AppConfig.GOOGLE_MEET_CLIENT_SECRET,
  },
];

/** getProvider нь id-аар провайдер олно (танихгүй бол undefined). */
export function getProvider(id: string): OAuthProvider | undefined {
  return OAuthProviders.find((p) => p.id === id);
}

/**
 * isConfigured нь тухайн провайдерыг ХОЛБОХ боломжтой эсэхийг заана. Client ID
 * БА secret хоёулаа шаардлагатай — secret-гүй бол code солилцоо гарцаагүй
 * бүтэлгүйтэх тул UI-д "боломжтой" гэж харуулах нь худал болно.
 */
export function isConfigured(p: OAuthProvider): boolean {
  return p.clientId().trim() !== '' && p.clientSecret().trim() !== '';
}

/** configuredProviders нь тохируулагдсан провайдерын id → true зураглал. */
export function configuredProviders(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of OAuthProviders) out[p.id] = isConfigured(p);
  return out;
}

/**
 * redirectUri нь API дээрх callback зам. Провайдерын консолд бүртгэсэнтэй ЯГ
 * таарах ёстой тул connect ба callback хоёр ҮРГЭЛЖ ижил утга угсарна.
 */
export function redirectUri(origin: string, id: ProviderID): string {
  return `${origin.replace(/\/$/, '')}/api/v1/integrations/${id}/callback`;
}

/** buildAuthorizeUrl нь провайдерын зөвшөөрлийн URL-ийг state-тэйгээр бүтээнэ. */
export function buildAuthorizeUrl(p: OAuthProvider, origin: string, state: string): string {
  const u = new URL(p.authorizeUrl);
  u.searchParams.set('client_id', p.clientId());
  u.searchParams.set('redirect_uri', redirectUri(origin, p.id));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', p.scope);
  u.searchParams.set('state', state);
  // access_type=offline + prompt=consent — refresh_token-ийг ҮРГЭЛЖ буцаахын
  // тулд (offline ганцаараа дахин зөвшөөрөлд refresh_token өгдөггүй).
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  // token_access_type=offline — Dropbox-ийн refresh_token авах параметр (Google
  // үүнийг үл хэрэгсэнэ).
  u.searchParams.set('token_access_type', 'offline');
  return u.toString();
}

/** OAuthToken нь token endpoint-ийн хариу (нормчилсон). */
export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  /** expiresAt нь epoch мс; хугацаагүй бол 0. */
  expiresAt: number;
}

/** tokenEndpointTimeoutMs нь провайдерын token endpoint-ийн хүлээх дээд хугацаа. */
const tokenEndpointTimeoutMs = 15_000;

/** postForm нь token endpoint рүү form-encoded хүсэлт илгээж JSON задална. */
async function postForm(url: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(tokenEndpointTimeoutMs),
  });
  if (!res.ok) throw new Error(`token endpoint responded ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** normalizeToken нь провайдерын хариунаас OAuthToken гаргана. */
function normalizeToken(json: Record<string, unknown>): OAuthToken {
  const access = typeof json.access_token === 'string' ? json.access_token : '';
  if (access === '') throw new Error('token endpoint returned no access_token');
  const refresh = typeof json.refresh_token === 'string' ? json.refresh_token : '';
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 0;
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
  };
}

/**
 * exchangeCodeForToken нь authorization code-ийг client_secret-тэйгээр access/
 * refresh токен болгон солилцоно. Алдаа гарвал throw хийнэ.
 */
export async function exchangeCodeForToken(
  p: OAuthProvider,
  origin: string,
  code: string,
): Promise<OAuthToken> {
  return normalizeToken(
    await postForm(
      p.tokenUrl,
      new URLSearchParams({
        code,
        client_id: p.clientId(),
        client_secret: p.clientSecret(),
        redirect_uri: redirectUri(origin, p.id),
        grant_type: 'authorization_code',
      }),
    ),
  );
}

/**
 * refreshAccessToken нь refresh_token-оор шинэ access токен авна. Провайдерууд
 * ихэвчлэн шинэ refresh_token буцаадаггүй тул хоосон байвал дуудагч хуучныг
 * хэвээр хадгална.
 */
export async function refreshAccessToken(
  p: OAuthProvider,
  refreshToken: string,
): Promise<OAuthToken> {
  return normalizeToken(
    await postForm(
      p.tokenUrl,
      new URLSearchParams({
        client_id: p.clientId(),
        client_secret: p.clientSecret(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    ),
  );
}
