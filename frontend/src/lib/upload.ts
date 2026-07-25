// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Файлыг API руу дамжуулах туслах.
//
// ЯАГААД BASE64 ВЭ (multipart биш): SPA нь файлыг ШУУД Google Drive/Dropbox руу
// илгээж чадахгүй — тэр нь client_secret болон хэрэглэгчийн OAuth токен
// шаарддаг ба хоёулаа зөвхөн сервер талд амьдардаг. Тиймээс файл API-гаар
// дамжина; JSON биетэй байх нь хүсэлтийн биеийн ерөнхий хязгаар, CSRF шалгалт,
// алдааны нэгдсэн дугтуй гурвуулангийнх нь дор үлдэхийг хангана.

import { postJSON, type ClientResult } from './client';

/** uploadMaxBytes нь API-ийн хязгаартай ижил (10 MiB) — UI эрт хэлнэ. */
export const uploadMaxBytes = 10 * 1024 * 1024;

/**
 * fileToBase64 нь файлын агуулгыг base64 болгоно.
 *
 * FileReader-ийн оронд `arrayBuffer()` — API нь ижил (амлалт буцаана) ч
 * `data:` угтвар салгах алхамгүй бөгөөд browser болон Node хоёуланд ажилладаг
 * тул тестэд DOM орчин шаардахгүй. `String.fromCharCode`-ийг хэсэгчлэн дуудна:
 * бүх байтыг нэг дор spread хийвэл том файл дээр stack хэтэрнэ.
 */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * uploadFile нь файлыг өгөгдсөн endpoint рүү base64-оор илгээнэ. Хэмжээ хэтэрсэн
 * бол сүлжээ рүү огт хүрэхгүй — шууд алдаа буцаана.
 */
export async function uploadFile<T = unknown>(
  path: string,
  file: File,
): Promise<ClientResult<T>> {
  if (file.size > uploadMaxBytes) {
    return { ok: false, status: 413, message: 'Файл хэт том байна (дээд тал нь 10 MB).' };
  }
  const data = await fileToBase64(file);
  return postJSON<T>(path, {
    data,
    mime: file.type || 'application/octet-stream',
    name: file.name,
  });
}
