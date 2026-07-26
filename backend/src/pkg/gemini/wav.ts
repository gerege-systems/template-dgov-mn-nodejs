// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// TTS model нь түүхий PCM (ихэвчлэн "audio/L16;codec=pcm;rate=24000")
// буцаадаг — browser-ууд үүнийг шууд тоглуулдаггүй тул WAV толгой нэмж
// өгдөг туслахууд.

const defaultPCMRate = 24_000;

/**
 * pcmRateFromMime нь "audio/L16;codec=pcm;rate=24000" хэлбэрийн mime-аас
 * sample rate-ийг гаргана; олдохгүй бол Gemini TTS-ийн өгөгдмөл 24000.
 */
export function pcmRateFromMime(mime: string): number {
  for (const part of mime.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).toLowerCase() !== 'rate') continue;
    const rate = Number.parseInt(trimmed.slice(eq + 1).trim(), 10);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }
  return defaultPCMRate;
}

/** pcmToWav нь 16-bit mono PCM байтуудыг WAV контейнерт ороож буцаана. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk хэмжээ
  header.writeUInt16LE(1, 20); // PCM формат
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
