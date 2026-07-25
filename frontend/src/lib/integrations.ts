import 'server-only';

// Гуравдагч этгээдийн интеграцийн (Google Drive, Dropbox, Google Meet) OAuth
// бүртгэл. Зөвхөн server талд уншигдана — client ID/secret хэзээ ч browser-т
// гарахгүй. Энэ нь OAuth-ийн "арматур": authorize URL-ийг бүтээх мета мэдээлэл
// энд байх ба токен солилцоог (token exchange) BFF callback route-д хийнэ.
// Тухайн провайдерын client ID env тохируулагдсан үед л "холбох" идэвхжинэ;
// тохируулаагүй бол UI "Удахгүй" төлөвт харагдана.

export type IntegrationID = 'google-drive' | 'dropbox' | 'google-meet';

export type IntegrationProvider = {
  id: IntegrationID;
  // Брэндийн нэр (орчуулдаггүй) — UI дээр translate="no".
  name: string;
  // OAuth 2.0 authorization endpoint.
  authorizeUrl: string;
  // OAuth 2.0 token endpoint (authorization code → access/refresh токен).
  tokenUrl: string;
  // Хүсэх эрхийн хүрээ (scope).
  scope: string;
  // Client ID-г уншина env-ийн нэр (secret биш — secret нь callback-д).
  clientIdEnv: string;
  // Client secret-ийн env нэр (token exchange-д, callback дотор).
  clientSecretEnv: string;
};

export const INTEGRATIONS: IntegrationProvider[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    // drive.file — апп зөвхөн ӨӨРИЙН үүсгэсэн файл/хавтсыг (Gerege folder) удирдана:
    // харах/хуулах/нэр солих/устгах. Бусад Drive-д хүрэхгүй (least privilege).
    scope: 'https://www.googleapis.com/auth/drive.file',
    clientIdEnv: 'GOOGLE_DRIVE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_DRIVE_CLIENT_SECRET',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    authorizeUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    // metadata.read — /Gerege хавтсыг жагсаах; content.read/write — татах/хуулах.
    scope: 'files.content.read files.content.write files.metadata.read',
    clientIdEnv: 'DROPBOX_CLIENT_ID',
    clientSecretEnv: 'DROPBOX_CLIENT_SECRET',
  },
  {
    id: 'google-meet',
    name: 'Google Meet',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/meetings.space.created',
    clientIdEnv: 'GOOGLE_MEET_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_MEET_CLIENT_SECRET',
  },
];

export function getIntegration(id: string): IntegrationProvider | undefined {
  return INTEGRATIONS.find((p) => p.id === id);
}

// configured нь client ID env тохируулагдсан эсэхээр "холбох боломжтой"
// эсэхийг шийднэ. Secret-ийг шалгахгүй (энэ нь page-д харагдах статусыг тогтоох
// зорилготой; secret зөвхөн token exchange-д хэрэгтэй).
export function isConfigured(p: IntegrationProvider): boolean {
  return !!(process.env[p.clientIdEnv] || '').trim();
}

// IntegrationStatus нь page-аас view руу дамжуулах серилизованих аюулгүй төлөв —
// env утга/токен биш, зөвхөн id + configured (холбох боломжтой эсэх) +
// connected (тухайн хэрэглэгч холбосон эсэх).
export type IntegrationStatus = {
  id: IntegrationID;
  name: string;
  configured: boolean;
  connected: boolean;
};

export function integrationStatuses(connected: Set<string>): IntegrationStatus[] {
  return INTEGRATIONS.map((p) => ({
    id: p.id,
    name: p.name,
    configured: isConfigured(p),
    connected: connected.has(p.id),
  }));
}

export type IntegrationToken = {
  access_token: string;
  refresh_token?: string;
  // Хүчинтэй хугацаа дуусах epoch ms (refresh-ийн шийдвэрт).
  expires_at?: number;
};

// exchangeCodeForToken нь authorization code-г провайдерын token endpoint руу
// client_secret-тэйгээр илгээж access/refresh токен болгон солилцоно. Алдаа
// гарвал throw хийнэ (callback нь exchange_failed-ээр буцаана).
export async function exchangeCodeForToken(
  p: IntegrationProvider,
  origin: string,
  code: string,
): Promise<IntegrationToken> {
  const body = new URLSearchParams({
    code,
    client_id: process.env[p.clientIdEnv] || '',
    client_secret: process.env[p.clientSecretEnv] || '',
    redirect_uri: redirectURI(origin, p.id),
    grant_type: 'authorization_code',
  });

  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error('token exchange: no access_token in response');
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
  };
}

// appOrigin нь OAuth redirect_uri болон буцах redirect-д ашиглах нийтийн
// origin. Reverse proxy-ний цаана req.url-ийн origin (дотоод хаяг) буруу байж
// болзошгүй тул тохируулсан APP_ORIGIN-г эрхэмлэнэ; эс бөгөөс req-ээс гаргана.
// redirect_uri нь Google/Dropbox-д бүртгэсэнтэй ЯГ таарах ёстой тул энэ нь
// чухал — connect ба callback хоёр ижил утгыг ашиглана.
export function appOrigin(req: Request): string {
  const configured = (process.env.APP_ORIGIN || '').split(',')[0].trim();
  return configured || new URL(req.url).origin;
}

// redirectURI нь тухайн origin дээрх BFF callback зам.
export function redirectURI(origin: string, id: IntegrationID): string {
  return `${origin.replace(/\/$/, '')}/api/integrations/${id}/callback`;
}

// buildAuthorizeURL нь провайдерын authorize endpoint рүү чиглэх бүрэн URL-ийг
// CSRF-ийн state-тэйгээр бүтээнэ.
export function buildAuthorizeURL(p: IntegrationProvider, origin: string, state: string): string {
  const u = new URL(p.authorizeUrl);
  u.searchParams.set('client_id', process.env[p.clientIdEnv] || '');
  u.searchParams.set('redirect_uri', redirectURI(origin, p.id));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', p.scope);
  u.searchParams.set('state', state);
  // access_type=offline + prompt=consent — refresh_token-ийг ҮРГЭЛЖ буцаахын
  // тулд (offline ганцаараа дахин зөвшөөрөлд refresh_token өгдөггүй). Ингэснээр
  // access token хугацаа дуусахад refresh хийж чадна.
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  // token_access_type=offline — Dropbox-ийн refresh_token авах параметр (Google
  // үүнийг үл хэрэгсэнэ). Ингэснээр Dropbox-ийн богино настай токеныг шинэчилнэ.
  u.searchParams.set('token_access_type', 'offline');
  return u.toString();
}
