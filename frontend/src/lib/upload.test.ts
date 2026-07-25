// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Файл дамжуулах туслахын тест. Гол баталгаанууд:
//   • хэт том файл СҮЛЖЭЭ рүү огт хүрэхгүй (клиент талд таслагдана);
//   • агуулга base64-оор, мета мэдээллийн хамт JSON биед явна;
//   • мутаци тул CSRF толгой дагалдана (client.ts-ээр дамжсан гэдгийн баталгаа).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CSRF_HEADER } from './client';
import { fileToBase64, uploadFile, uploadMaxBytes } from './upload';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: true, data: { url: 'https://x/y' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('document', { cookie: 'dgov_csrf=tok-123' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fileToBase64', () => {
  it('`data:` угтварыг хасаж base64-г буцаана', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    await expect(fileToBase64(blob)).resolves.toBe(btoa('hello'));
  });
});

describe('uploadFile', () => {
  it('base64 + мета мэдээллийг JSON биеэр илгээнэ', async () => {
    const file = new File(['hi'], 'a.png', { type: 'image/png' });
    const res = await uploadFile('/integrations/google-drive/image', file);

    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/integrations/google-drive/image');
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body).toEqual({ data: btoa('hi'), mime: 'image/png', name: 'a.png' });
    expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe('tok-123');
  });

  it('хэт том файл дээр СҮЛЖЭЭ рүү огт хандахгүй', async () => {
    const big = new File([new Uint8Array(uploadMaxBytes + 1)], 'big.bin');
    const res = await uploadFile('/integrations/dropbox/upload', big);

    expect(res).toMatchObject({ ok: false, status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mime тодорхойгүй файлд аюулгүй анхдагч тавина', async () => {
    const file = new File(['x'], 'unknown', { type: '' });
    await uploadFile('/integrations/dropbox/upload', file);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.mime).toBe('application/octet-stream');
  });
});
