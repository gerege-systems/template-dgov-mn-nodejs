// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// pkg/cloudfiles нь хэрэглэгчийн үүлэн хадгалалт (Google Drive · Dropbox) болон
// Google Meet рүү хандах SDK-гүй REST client. Токеныг дуудагч (usecase) өгнө —
// энэ модуль хадгалалт/шифрлэлт мэддэггүй.
//
// Бүх үйлдэл АПП-ЫН ӨӨРИЙН хавтсаар (Drive: "Gerege" folder, Dropbox:
// "/Gerege") хязгаарлагдана. Drive-ийн drive.file scope нь угаасаа апп-ын
// үүсгээгүй файлыг харуулдаггүй; Dropbox-д зам шалгалтыг ил хийнэ.

/** GeregeFolder нь апп-ын зориулалтын хавтасны нэр (хоёр провайдерт ижил). */
export const GeregeFolder = 'Gerege';

/** DropboxFolder нь Dropbox дахь бүрэн зам. */
export const DropboxFolder = `/${GeregeFolder}`;

/** apiTimeoutMs нь гуравдагч талын API-ийн хүлээх дээд хугацаа. */
const apiTimeoutMs = 20_000;

/** uploadTimeoutMs нь файл хуулах (том биетэй) хүсэлтийн хүлээх хугацаа. */
const uploadTimeoutMs = 60_000;

/**
 * ProviderApiError нь гуравдагч талын API-ийн бүтэлгүйтэл. `status` нь тэдний
 * HTTP статус — дуудагч 401-ийг "холболт хүчингүй болсон" гэж ялгана.
 */
export class ProviderApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}

/** authJson нь Bearer токентой JSON хүсэлт илгээж хариуг задална. */
async function authJson<T>(
  url: string,
  token: string,
  init: RequestInit = {},
  timeoutMs = apiTimeoutMs,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new ProviderApiError(res.status, `provider API responded ${res.status}`);
  }
  // 204 (эсвэл хоосон бие) дээр JSON задлах гэж унахгүй.
  const text = await res.text();
  return (text === '' ? {} : JSON.parse(text)) as T;
}

// ───────────────────────────── Google Drive ─────────────────────────────

/** DriveFile нь Drive-ийн файлын жагсаалтын нэгж (SPA-д хэрэгтэй талбарууд). */
export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  webViewLink?: string;
}

/**
 * driveFindOrCreateFolder нь хэрэглэгчийн Drive дахь "Gerege" хавтсыг олно,
 * байхгүй бол үүсгэнэ. drive.file scope тул зөвхөн апп өөрөө үүсгэсэн хавтсыг
 * хардаг — хэрэглэгчийн бусад "Gerege" нэртэй хавтсыг ХӨНДӨХГҮЙ.
 */
export async function driveFindOrCreateFolder(token: string): Promise<string> {
  const q = `name = '${GeregeFolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await authJson<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    token,
  );
  const existing = found.files?.[0]?.id;
  if (existing) return existing;

  const created = await authJson<{ id?: string }>(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: GeregeFolder,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    },
  );
  if (!created.id) throw new ProviderApiError(502, 'drive: folder create returned no id');
  return created.id;
}

/** driveListFiles нь "Gerege" хавтасны доторх файлуудыг жагсаана. */
export async function driveListFiles(token: string): Promise<DriveFile[]> {
  const folderId = await driveFindOrCreateFolder(token);
  const q = `'${folderId}' in parents and trashed = false`;
  const fields = 'files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink)';
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&pageSize=200&orderBy=${encodeURIComponent('folder,name')}&fields=${encodeURIComponent(fields)}`;
  const j = await authJson<{ files?: DriveFile[] }>(url, token);
  return j.files ?? [];
}

/** multipartRelated нь Drive-ийн multipart/related биеийг угсарна. */
function multipartRelated(
  boundary: string,
  meta: Record<string, unknown>,
  mime: string,
  data: Buffer,
): Buffer {
  const pre =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  return Buffer.concat([
    Buffer.from(pre, 'utf-8'),
    data,
    Buffer.from(`\r\n--${boundary}--`, 'utf-8'),
  ]);
}

/** driveUpload нь файлыг "Gerege" хавтас руу хуулж мета мэдээллийг буцаана. */
export async function driveUpload(
  token: string,
  name: string,
  mime: string,
  data: Buffer,
  boundary: string,
): Promise<DriveFile> {
  const folderId = await driveFindOrCreateFolder(token);
  const body = multipartRelated(
    boundary,
    { name, mimeType: mime, parents: [folderId] },
    mime,
    data,
  );
  return authJson<DriveFile>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    },
    uploadTimeoutMs,
  );
}

/**
 * driveUploadSharedImage нь зургийг хуулаад "холбоос бүхий хэн ч харах" эрх
 * тавьж, <img>-д харагдах URL буцаана. Гарын үсэг/тамганы зураг нь баримт
 * дээр харагдах ёстой тул нээлттэй байх шаардлагатай.
 *
 * lh3.googleusercontent.com/d/<id> хэлбэрийг ашиглана — drive.google.com/uc нь
 * сүүлийн үед embed-д зогсдог болсон.
 */
export async function driveUploadSharedImage(
  token: string,
  name: string,
  mime: string,
  data: Buffer,
  boundary: string,
): Promise<string> {
  const file = await driveUpload(token, name, mime, data, boundary);
  if (!file.id) throw new ProviderApiError(502, 'drive: upload returned no id');
  await authJson(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return `https://lh3.googleusercontent.com/d/${file.id}`;
}

/** driveRename нь файлын нэрийг солино. */
export function driveRename(token: string, fileId: string, name: string): Promise<DriveFile> {
  return authJson<DriveFile>(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
}

/** driveDelete нь файлыг устгана. */
export async function driveDelete(token: string, fileId: string): Promise<void> {
  await authJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, token, {
    method: 'DELETE',
  });
}

// ─────────────────────────────── Dropbox ───────────────────────────────

/** DropboxEntry нь Dropbox-ийн жагсаалтын нэгж (нормчилсон). */
export interface DropboxEntry {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  modified?: string;
}

/** str нь танихгүй JSON утгыг мөр болгоно (мөр биш бол хоосон). */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** dropboxRpc нь Dropbox-ийн JSON-RPC маягийн endpoint-ыг дуудна. */
function dropboxRpc<T>(token: string, url: string, arg: unknown): Promise<T> {
  return authJson<T>(url, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
}

/**
 * dropboxEnsureFolder нь "/Gerege" хавтсыг үүсгэнэ. Аль хэдийн байвал Dropbox
 * `conflict/folder` алдаа буцаадаг — энэ нь АМЖИЛТ гэж тооцогдоно.
 */
export async function dropboxEnsureFolder(token: string): Promise<void> {
  try {
    await dropboxRpc(token, 'https://api.dropboxapi.com/2/files/create_folder_v2', {
      path: DropboxFolder,
      autorename: false,
    });
  } catch (err) {
    // 409 = зөрчил (хавтас аль хэдийн байна) — бусад алдааг дамжуулна.
    if (err instanceof ProviderApiError && err.status === 409) return;
    throw err;
  }
}

/** dropboxList нь "/Gerege" хавтасны контентыг нормчилж жагсаана. */
export async function dropboxList(token: string): Promise<DropboxEntry[]> {
  await dropboxEnsureFolder(token);
  const j = await dropboxRpc<{ entries?: Record<string, unknown>[] }>(
    token,
    'https://api.dropboxapi.com/2/files/list_folder',
    { path: DropboxFolder, recursive: false, limit: 200 },
  );
  return (j.entries ?? []).map((e) => ({
    id: str(e.id) || str(e.path_lower) || str(e.name),
    name: str(e.name),
    path: str(e.path_display) || str(e.path_lower),
    isFolder: e['.tag'] === 'folder',
    ...(typeof e.size === 'number' ? { size: e.size } : {}),
    ...(typeof e.server_modified === 'string' ? { modified: e.server_modified } : {}),
  }));
}

/** dropboxTemporaryLink нь файлын түр хугацааны (≈4ц) шууд линк буцаана. */
export async function dropboxTemporaryLink(token: string, path: string): Promise<string> {
  const j = await dropboxRpc<{ link?: string }>(
    token,
    'https://api.dropboxapi.com/2/files/get_temporary_link',
    { path },
  );
  return j.link ?? '';
}

/**
 * dropboxApiArg нь Dropbox-API-Arg толгойн утгыг бүтээнэ. Толгой нь ASCII байх
 * ёстой тул ASCII-аас гадуурх тэмдэгтийг \uXXXX болгон escape хийнэ (кирилл
 * файлын нэр энгийн зүйл).
 */
export function dropboxApiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(/[^\x20-\x7e]/g, (c) => {
    const hex = c.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${hex}`;
  });
}

/** dropboxUpload нь файлыг "/Gerege" хавтас руу хуулна. */
export async function dropboxUpload(
  token: string,
  name: string,
  data: Buffer,
): Promise<Record<string, unknown>> {
  await dropboxEnsureFolder(token);
  return authJson<Record<string, unknown>>(
    'https://content.dropboxapi.com/2/files/upload',
    token,
    {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': dropboxApiArg({
          path: `${DropboxFolder}/${name}`,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(data),
    },
    uploadTimeoutMs,
  );
}

// ───────────────────────────── Google Meet ─────────────────────────────

/** MeetSpace нь шинээр үүсгэсэн уулзалтын линк/код. */
export interface MeetSpace {
  meetingUri: string;
  meetingCode: string;
}

/**
 * meetCreateSpace нь Google Meet-ийн уулзалт (space) үүсгэнэ.
 *
 * accessType: TRUSTED — нэвтэрсэн (Google account-тай) хэрэглэгч шууд орно,
 * бусад нь хост зөвшөөрөх хүртэл хүлээнэ. Танихгүй хүн санамсаргүй нэвтрэхээс
 * сэргийлэх аюулгүй анхдагч.
 */
export async function meetCreateSpace(token: string): Promise<MeetSpace> {
  const j = await authJson<{ meetingUri?: string; meetingCode?: string }>(
    'https://meet.googleapis.com/v2/spaces',
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { accessType: 'TRUSTED' } }),
    },
  );
  return { meetingUri: j.meetingUri ?? '', meetingCode: j.meetingCode ?? '' };
}
