import 'server-only';
import { authedFetch } from './api';
import { getIntegration, type IntegrationID } from './integrations';

// Server-тал дахь Google Drive (болон бусад провайдер) токены туслах. Backend-аас
// decrypt хийсэн токеныг авч, хугацаа дууссан бол refresh_token-оор шинэчилж,
// шинэ токеныг (шифрлүүлэхээр) backend руу буцаан хадгална. Токен browser руу
// ХЭЗЭЭ Ч гарахгүй — зөвхөн энэ server модуль ашиглана.

interface TokenResp {
  access_token: string;
  refresh_token: string;
  expires_at_ms: number;
}

export async function getProviderAccessToken(provider: IntegrationID): Promise<string | null> {
  const r = await authedFetch<TokenResp>(`/integrations/${provider}/token`, { method: 'GET' });
  if (!r.ok || !r.data?.access_token) return null;

  const { access_token, refresh_token, expires_at_ms } = r.data;
  // 60 секундын skew-ээр хугацаа дуусах гэж байвал refresh хийнэ.
  if (expires_at_ms && expires_at_ms - 60_000 < Date.now() && refresh_token) {
    const fresh = await refreshAccessToken(provider, refresh_token);
    if (fresh) {
      await authedFetch('/integrations', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          access_token: fresh.access_token,
          refresh_token,
          expires_at_ms: fresh.expires_at_ms,
        }),
      });
      return fresh.access_token;
    }
  }
  return access_token;
}

// findOrCreateGeregeFolder нь хэрэглэгчийн Drive дахь апп-ын зориулалтын "Gerege"
// хавтсыг олно, байхгүй бол үүсгэнэ. drive.file scope тул зөвхөн апп өөрөө
// үүсгэсэн хавтсыг хардаг — бусад "Gerege*" хавтсыг хөндөхгүй.
export const GEREGE_FOLDER_NAME = 'Gerege';

export async function findOrCreateGeregeFolder(token: string): Promise<string | null> {
  const q = `name = '${GEREGE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const findRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (findRes.ok) {
    const j = (await findRes.json()) as { files?: { id: string }[] };
    if (j.files?.[0]?.id) return j.files[0].id;
  }
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: GEREGE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    cache: 'no-store',
  });
  if (!createRes.ok) return null;
  const cj = (await createRes.json()) as { id?: string };
  return cj.id ?? null;
}

// uploadImageToDrive нь зургийг хэрэглэгчийн "Gerege" хавтаст байршуулж, "холбоос
// бүхий хэн ч харах" эрх тавьж, <img>-д харагдах URL буцаана. drive.file scope тул
// зөвхөн апп-ын үүсгэсэн файлыг л удирдана.
export async function uploadImageToDrive(
  token: string,
  name: string,
  mime: string,
  data: Buffer,
): Promise<string | null> {
  const folderId = await findOrCreateGeregeFolder(token);
  const boundary = 'gerege' + Math.random().toString(16).slice(2);
  const meta: Record<string, unknown> = { name, mimeType: mime };
  if (folderId) meta.parents = [folderId];
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(pre, 'utf-8'), data, Buffer.from(post, 'utf-8')]);

  const upRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    cache: 'no-store',
  });
  if (!upRes.ok) return null;
  const uj = (await upRes.json()) as { id?: string };
  const id = uj.id;
  if (!id) return null;

  // Харагдахуйц болгохын тулд "anyone with link: reader" эрх тавина.
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    cache: 'no-store',
  });
  // lh3.googleusercontent.com/d/<id> нь <img>-д найдвартай (drive.google.com/uc нь
  // сүүлийн үед embed-д зогсдог болсон). Файл "anyone with link" тул нээлттэй.
  return `https://lh3.googleusercontent.com/d/${id}`;
}

async function refreshAccessToken(provider: IntegrationID, refreshToken: string) {
  const p = getIntegration(provider);
  if (!p) return null;
  const clientId = process.env[p.clientIdEnv] || '';
  const clientSecret = process.env[p.clientSecretEnv] || '';
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  return {
    access_token: j.access_token,
    expires_at_ms: j.expires_in ? Date.now() + j.expires_in * 1000 : 0,
  };
}
