// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// Gemini REST client-ийн unit тестүүд. Гол зорилго: түр зуурын алдаа
// (429/5xx/сүлжээ) ДАХИН оролдогдох, бус-түр зуурын 4xx НЭГ Л удаа явах,
// түлхүүргүй bootstrap нь сүлжээнд огт хүрэхгүй байх.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ErrGeminiNotConfigured,
  newGeminiClient,
  responseFunctionCalls,
  responseInlineAudio,
  responseModelContent,
  responseText,
} from './gemini.js';
import type { GeminiResponse } from './gemini.js';
import { pcmRateFromMime, pcmToWav } from './wav.js';

const base = 'https://gemini.example.invalid/v1beta';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(Buffer.from(JSON.stringify(body), 'utf8'), { status });
}

/** noSleep нь backoff-ийг тестэд шууд өнгөрүүлнэ (бодит хүлээлтгүй). */
const noSleep = (): Promise<void> => Promise.resolve();

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gemini client — тохиргоо', () => {
  it('API түлхүүргүй бол сүлжээнд ХҮРЭХГҮЙ, ErrGeminiNotConfigured шиднэ', async () => {
    const client = newGeminiClient(base, '', 'gemini-2.5-flash', noSleep);
    await expect(client.generateContent({ contents: [] })).rejects.toBeInstanceOf(
      ErrGeminiNotConfigured,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('model + x-goog-api-key толгойг зөв угсарна', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ candidates: [] }));
    const client = newGeminiClient(`${base}/`, 'key-123', 'my-model', noSleep);
    await client.generateContent({ contents: [{ role: 'user', parts: [{ text: 'сайн уу' }] }] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${base}/models/my-model:generateContent`);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('key-123');
    expect(JSON.parse(init.body as string)).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'сайн уу' }] }],
    });
  });
});

describe('gemini client — дахин оролдлого', () => {
  it('429-ийн дараа амжилттай болвол хариуг буцаана', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      );
    const client = newGeminiClient(base, 'k', 'm', noSleep);
    const resp = await client.generateContent({ contents: [] });
    expect(responseText(resp)).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('5xx нь 3 удаа оролдоод бүтэлгүйтнэ', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 503));
    const client = newGeminiClient(base, 'k', 'm', noSleep);
    await expect(client.generateContent({ contents: [] })).rejects.toThrow('3 attempts failed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('400 нь НЭГ Л удаа явна (дахин оролдох утгагүй)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad request' }, 400));
    const client = newGeminiClient(base, 'k', 'm', noSleep);
    await expect(client.generateContent({ contents: [] })).rejects.toThrow('status 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('сүлжээний алдаа нь дахин оролдогдоно', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }),
      );
    const client = newGeminiClient(base, 'k', 'm', noSleep);
    expect(responseText(await client.generateContent({ contents: [] }))).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('цуцлагдсан контекст дээр дахин оролдохгүй', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new Error('aborted'));
    const client = newGeminiClient(base, 'k', 'm', noSleep);
    await expect(client.generateContent({ contents: [] }, controller.signal)).rejects.toThrow(
      'gemini: http',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('JSON биш хариу нь тодорхой алдаа өгнө (дахин оролдохгүй)', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('<html>502</html>', 'utf8')));
    const client = newGeminiClient(base, 'k', 'm', noSleep);
    await expect(client.generateContent({ contents: [] })).rejects.toThrow('decode response');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('gemini хариуны туслахууд', () => {
  const resp: GeminiResponse = {
    candidates: [
      {
        content: {
          parts: [
            { text: '  Сайн ' },
            { text: 'байна уу  ' },
            { functionCall: { name: 'get_server_time', args: {} } },
            { inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AAA=' } },
          ],
        },
      },
    ],
  };

  it('текстийн хэсгүүдийг нэгтгэж trim хийнэ', () => {
    expect(responseText(resp)).toBe('Сайн байна уу');
  });

  it('function дуудлагуудыг гаргаж авна', () => {
    expect(responseFunctionCalls(resp).map((c) => c.name)).toEqual(['get_server_time']);
  });

  it('audio inlineData-г олно', () => {
    expect(responseInlineAudio(resp)?.mimeType).toContain('L16');
  });

  it('role байхгүй бол model гэж тооцно', () => {
    expect(responseModelContent({ candidates: [{ content: { parts: [] } }] }).role).toBe('model');
  });

  it('candidate байхгүй бол хоосон утга буцаана', () => {
    expect(responseText({})).toBe('');
    expect(responseFunctionCalls({})).toEqual([]);
    expect(responseInlineAudio({})).toBeNull();
    expect(responseModelContent({})).toEqual({ role: 'model', parts: [] });
  });
});

describe('WAV туслахууд', () => {
  it('mime-аас sample rate уншина', () => {
    expect(pcmRateFromMime('audio/L16;codec=pcm;rate=16000')).toBe(16_000);
    expect(pcmRateFromMime('audio/L16; codec=pcm; RATE=8000')).toBe(8000);
  });

  it('rate байхгүй бол Gemini TTS-ийн өгөгдмөл 24000', () => {
    expect(pcmRateFromMime('audio/L16;codec=pcm')).toBe(24_000);
    expect(pcmRateFromMime('')).toBe(24_000);
  });

  it('PCM-г зөв RIFF/WAVE толгойтой болгоно', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length);
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt32LE(28)).toBe(48_000); // byteRate = rate * 2
    expect(wav.readUInt16LE(32)).toBe(2); // blockAlign
    expect(wav.readUInt16LE(34)).toBe(16); // bitsPerSample
    expect(wav.subarray(36, 40).toString('ascii')).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });
});
