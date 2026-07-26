// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// API client-ийн тестүүд. Гол баталгаанууд:
//   • бүх зам `/api/v1` угтвартай явна (nginx тэрийг api руу проксилно);
//   • МУТАЦИЙН хүсэлт бүр CSRF толгойг cookie-оос хуулж зөөнө;
//   • cookie нь ЗӨВХӨН ижил origin руу (credentials: same-origin);
//   • дугтуй тайлагдаж, 422-ийн талбарын алдаа гарч ирнэ;
//   • сүлжээний алдаа нь status=0 (UI ялгаж харуулна) — throw хийхгүй.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiUrl, getJSON, postJSON, readCsrfToken, sendForm } from './client';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('document', { cookie: 'dgov_csrf=tok-123; other=x' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiUrl', () => {
  it('замд /api/v1 угтвар нэмнэ', () => {
    expect(apiUrl('/users/me')).toBe('/api/v1/users/me');
    expect(apiUrl('users/me')).toBe('/api/v1/users/me');
  });

  it('аль хэдийн угтвартайг ДАВХАРДУУЛАХГҮЙ', () => {
    expect(apiUrl('/api/v1/users/me')).toBe('/api/v1/users/me');
  });

  it('абсолют URL-ыг хэвээр үлдээнэ', () => {
    expect(apiUrl('https://eid.example.mn/x')).toBe('https://eid.example.mn/x');
  });
});

describe('CSRF токен', () => {
  it('cookie-оос уншина', () => {
    expect(readCsrfToken()).toBe('tok-123');
  });

  it('cookie байхгүй бол хоосон', () => {
    vi.stubGlobal('document', { cookie: 'other=x' });
    expect(readCsrfToken()).toBe('');
  });

  it('мутацийн хүсэлтэд толгой болж явна', async () => {
    fetchMock.mockResolvedValue(json({ status: true, data: { ok: 1 } }));
    await postJSON('/gov/applications', { service_id: 'x' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/gov/applications');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-dgov-csrf']).toBe('tok-123');
    expect(init.credentials).toBe('same-origin');
    expect(init.method).toBe('POST');
  });

  it('multipart хүсэлтэд ч явна (Content-Type-ыг browser тавина)', async () => {
    fetchMock.mockResolvedValue(json({ status: true }));
    await sendForm('/sign/init', new FormData());
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-dgov-csrf']).toBe('tok-123');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('GET хүсэлт нь мутаци БИШ — толгойгүй', async () => {
    fetchMock.mockResolvedValue(json({ status: true, data: [] }));
    await getJSON('/gov/services');
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.headers).toBeUndefined();
    expect(init.credentials).toBe('same-origin');
  });
});

describe('дугтуй тайлах', () => {
  it('амжилттай хариунаас data-г гаргана', async () => {
    fetchMock.mockResolvedValue(json({ status: true, message: 'ok', data: { id: 'u-1' } }));
    await expect(getJSON<{ id: string }>('/users/me')).resolves.toEqual({ id: 'u-1' });
  });

  it('422-ийн талбарын алдааг зурагладаг', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          status: false,
          message: 'validation failed',
          data: { errors: [{ field: 'email', message: 'is required' }] },
        },
        422,
      ),
    );
    const res = await postJSON('/admin/users', {});
    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
    expect(res.fieldErrors).toEqual({ email: 'is required' });
  });

  it('status:false нь HTTP 200 дээр ч амжилтгүй гэж тооцогдоно', async () => {
    fetchMock.mockResolvedValue(json({ status: false, message: 'nope' }));
    const res = await postJSON('/x', {});
    expect(res.ok).toBe(false);
  });

  it('GET алдаан дээр ApiError шиднэ (queryFn-д)', async () => {
    fetchMock.mockResolvedValue(json({ status: false, message: 'unauthorized' }, 401));
    await expect(getJSON('/users/me')).rejects.toMatchObject({ status: 401 });
  });

  it('JSON биш хариу нь статусаараа шийдэгдэнэ', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    const res = await postJSON('/auth/logout', {});
    expect(res.ok).toBe(true);
  });
});

describe('дугтуйн ДАВХАР боолт', () => {
  // `/users/me` нь `data`-г дахин нэг давхар боодог: `{ data: { user: {…} } }`.
  // SPA хөрвүүлэлтийн үед энэ давхаргыг задлахаа мартсанаас нэвтэрсэн иргэний
  // нэр/и-мэйл огт харагдахгүй болсон (401 ч биш, алдаа ч биш — зүгээр хоосон).
  it('getJSON нь `data`-г буцаана — дотоод боолтыг дуудагч задлана', async () => {
    fetchMock.mockResolvedValue(
      json({ status: true, data: { user: { id: 'u-1', username: 'eid_1', first_name: 'Бат' } } }),
    );
    const res = await getJSON<{ user: { id: string; first_name: string } }>('/users/me');
    expect(res.user.first_name).toBe('Бат');
  });
});

describe('сүлжээний алдаа', () => {
  it('status=0 болж буцна (throw ХИЙХГҮЙ)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await postJSON('/x', {});
    expect(res).toMatchObject({ ok: false, status: 0 });
    expect(res.message).toContain('Сүлжээ');
  });
});
