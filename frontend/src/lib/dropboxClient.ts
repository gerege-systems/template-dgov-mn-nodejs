import 'server-only';

// Dropbox-ийн зориулалтын "/Gerege" хавтас. Dropbox нь path-аар ажилладаг тул
// folder id шаардлагагүй.
export const DROPBOX_FOLDER = '/Gerege';

// ensureDropboxGeregeFolder нь /Gerege хавтсыг үүсгэнэ (байвал 409 → OK).
export async function ensureDropboxGeregeFolder(token: string): Promise<boolean> {
  const res = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: DROPBOX_FOLDER, autorename: false }),
    cache: 'no-store',
  });
  return res.ok || res.status === 409;
}

// Dropbox-API-Arg header нь ASCII байх ёстой — ASCII бус тэмдэгт (кириллик г.м.)-ийг
// \uXXXX болгон escape хийнэ (header-д шууд тавихад алдахгүй).
export function dropboxApiArg(obj: unknown): string {
  const json = JSON.stringify(obj);
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    out += code > 127 ? '\\u' + code.toString(16).padStart(4, '0') : json[i];
  }
  return out;
}
