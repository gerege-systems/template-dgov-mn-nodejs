// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Gerege Core клиентийн unit тестүүд. Гол зорилго: token байхгүй үед домэйн
// ИНЕРТ байх (500 биш), service token нь зөв header-ээр явах, Core-ийн эвдэрсэн
// хариу апп-ыг 500 болгохгүй байх.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorType, is } from '../../apperror/index.js';
import { background } from '../../pkg/ctx/ctx.js';
import { newCoreUsecase } from './core_impl.js';

const base = 'https://core.example.invalid';
const token = 'svc-token-abc';

/** jsonResponse нь fetch-ийн хариуг хуурамчаар бүтээнэ. */
function jsonResponse(body: string, status = 200): Response {
  return new Response(Buffer.from(body, 'utf8'), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('core usecase — тохируулаагүй үе', () => {
  it('token хоосон бол сүлжээнд ХҮРЭХГҮЙ, зааварчилгаа буцаана', async () => {
    const uc = newCoreUsecase(base, '');
    const out = (await uc.findUsers(background(), '00123456')) as { message: string };
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.message).toContain('CORE_API_TOKEN');
  });

  it('байгууллагын хайлт ч мөн адил инерт', async () => {
    const uc = newCoreUsecase(base, '');
    const out = (await uc.findOrganizations(background(), '1234567')) as { message: string };
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.message).toContain('core.gerege.mn');
  });
});

describe('core usecase — findUsers', () => {
  it('POST /api/user/find руу search_text-тэй JSON body илгээнэ', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"result":[{"core_id":"42"}]}'));
    const uc = newCoreUsecase(base, token);

    const out = await uc.findUsers(background(), 'АА00112233');

    expect(out).toEqual({ result: [{ core_id: '42' }] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${base}/api/user/find`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ search_text: 'АА00112233' }));
  });

  it('service token-ыг Bearer header-ээр зөөнө', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const uc = newCoreUsecase(base, token);

    await uc.findUsers(background(), 'x');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('base-ийн төгсгөлийн slash-ийг хасна (давхар // болохоос сэргийлнэ)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{}'));
    const uc = newCoreUsecase(`${base}///`, token);

    await uc.findUsers(background(), 'x');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${base}/api/user/find`);
  });
});

describe('core usecase — findOrganizations', () => {
  it('GET /api/organization/find?search_text=... болж, body ИЛГЭЭХГҮЙ', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"result":[]}'));
    const uc = newCoreUsecase(base, token);

    await uc.findOrganizations(background(), 'Гэрэгэ Системс');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${base}/api/organization/find?search_text=${encodeURIComponent('Гэрэгэ Системс').replace(/%20/g, '+')}`,
    );
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    // GET-д body байхгүй тул Content-Type ч тавихгүй.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});

describe('core usecase — алдааны зан үйл', () => {
  it('Core 4xx/5xx буцаавал ДОТООД алдаа болно (шалтгаан клиентэд гарахгүй)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{"error":"nope"}', 503));
    const uc = newCoreUsecase(base, token);

    await expect(uc.findUsers(background(), 'x')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });

  it('сүлжээний алдаа ДОТООД алдаа болно', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const uc = newCoreUsecase(base, token);

    await expect(uc.findOrganizations(background(), 'x')).rejects.toSatisfy((err: unknown) =>
      is(err, ErrorType.Internal),
    );
  });

  it('хариу JSON БИШ бол null — эвдэрсэн Core нь 500 болохгүй', async () => {
    fetchMock.mockResolvedValue(jsonResponse('<html>gateway error</html>'));
    const uc = newCoreUsecase(base, token);

    await expect(uc.findUsers(background(), 'x')).resolves.toBeNull();
  });

  it('4 MiB-аас том хариу тайрагдаж null болно (санах ойн хамгаалалт)', async () => {
    // 4 MiB + зайг давсан хүчинтэй JSON — тайрагдсаны дараа JSON биш болно.
    const huge = `{"pad":"${'a'.repeat((4 << 20) + 16)}"}`;
    fetchMock.mockResolvedValue(jsonResponse(huge));
    const uc = newCoreUsecase(base, token);

    await expect(uc.findUsers(background(), 'x')).resolves.toBeNull();
  });
});
