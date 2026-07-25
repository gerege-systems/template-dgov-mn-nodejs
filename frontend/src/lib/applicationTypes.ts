// Applications (OAuth2 client — Ory Hydra) BFF (/api/applications/*) хариунуудын
// TypeScript хэлбэрүүд. API-Gateway-ийн consumer ба SSO-ийн RP бүртгэлийг нэгтгэсэн
// нэгдмэл загвар.

export type AppType = 'web' | 'spa' | 'native' | 'm2m';

export interface Application {
  id: string;
  client_id: string;
  name: string;
  app_type: AppType;
  tags: string[];
  redirect_uris: string[];
  enabled: boolean;
  service_ids: string[];
  /** Зөвхөн create/rotate хариунд ирнэ (нэг удаа харагдана). */
  secret?: string;
  created_at: string;
  updated_at?: string;
}

/** app_type сонголтын mn/en шошго. */
export const APP_TYPES: { value: AppType; mn: string; en: string }[] = [
  { value: 'web', mn: 'Веб апп', en: 'Web app' },
  { value: 'spa', mn: 'SPA', en: 'SPA' },
  { value: 'native', mn: 'Мобайл/Native', en: 'Mobile / Native' },
  { value: 'm2m', mn: 'Сервер-хоорондын (M2M)', en: 'Server-to-server (M2M)' },
];

/** app_type нь redirect URI шаарддаг (OAuth redirect flow) эсэх. */
export function needsRedirect(t: AppType): boolean {
  return t === 'web' || t === 'spa' || t === 'native';
}

/** app_type нь нууц түлхүүртэй (confidential) эсэх — secret rotate зөвшөөрөгдөнө. */
export function isConfidential(t: AppType): boolean {
  return t === 'web' || t === 'm2m';
}

/** app_type-д харгалзах OAuth2 grant / auth-method (backend grantsFor-той тохирно). */
function oauthProfile(t: AppType): { grant_types: string[]; token_endpoint_auth_method: string } {
  if (t === 'm2m') {
    return { grant_types: ['client_credentials'], token_endpoint_auth_method: 'client_secret_basic' };
  }
  return {
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: isConfidential(t) ? 'client_secret_basic' : 'none',
  };
}

/**
 * RP талд тохиргоо хийхэд шаардлагатай бүх утгыг агуулсан JSON объект.
 * client_secret нь зөвхөн үүсгэх/rotate/set хариунд НЭГ удаа ирдэг тул энэ
 * файлыг тэр үед л бүрэн татаж авах боломжтой.
 */
export function buildClientConfig(app: Application, origin: string): Record<string, unknown> {
  const { grant_types, token_endpoint_auth_method } = oauthProfile(app.app_type);
  return {
    name: app.name,
    app_type: app.app_type,
    client_id: app.client_id,
    ...(app.secret ? { client_secret: app.secret } : {}),
    ...(needsRedirect(app.app_type) ? { redirect_uris: app.redirect_uris ?? [] } : {}),
    grant_types,
    token_endpoint_auth_method,
    issuer: origin,
    discovery_url: `${origin}/.well-known/openid-configuration`,
    authorization_endpoint: `${origin}/oauth2/auth`,
    token_endpoint: `${origin}/oauth2/token`,
    userinfo_endpoint: `${origin}/userinfo`,
    jwks_uri: `${origin}/.well-known/jwks.json`,
    end_session_endpoint: `${origin}/oauth2/sessions/logout`,
  };
}

/** Тохиргоог `<name>-oauth-client.json` нэртэй файлаар татна (browser-only). */
export function downloadClientConfig(app: Application): void {
  const cfg = buildClientConfig(app, window.location.origin);
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${app.client_id || app.name}-oauth-client.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
