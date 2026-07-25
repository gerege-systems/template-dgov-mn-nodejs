// Browser талын audio туслахууд — бичлэг (MediaRecorder) болон base64
// хөрвүүлэлт. AI voice боломжууд (дуут мессеж, live орчуулга) хэрэглэнэ.

/** MediaRecorder-ийн дэмждэг хамгийн тохиромжтой audio mime-г сонгоно. */
export function pickAudioMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

/** Blob-ийг base64 мөр болгоно (data: prefix-гүй). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface RecordedAudio {
  /** Backend-ийн whitelist-тэй таарах цэвэр mime (codec параметргүй). */
  mime: string;
  /** base64 кодлогдсон бичлэг. */
  data: string;
}

/**
 * Нэг бичлэгийн сегмент — recorder-ийг stop() хийх хүртэл бичээд бүрэн
 * (тоглуулах боломжтой) файл болгож буцаана. Live орчуулга сегментүүдийг
 * дараалан авдаг: timeslice-тэй chunk нь зөвхөн эхнийдээ container header
 * агуулдаг тул сегмент бүрд шинэ MediaRecorder ажиллуулна.
 */
export function recordSegment(
  stream: MediaStream,
  maxMs: number,
): { stop: () => void; done: Promise<RecordedAudio | null> } {
  const mimeFull = pickAudioMime();
  const recorder = new MediaRecorder(stream, { mimeType: mimeFull });
  const chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const done = new Promise<RecordedAudio | null>((resolve) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      if (timer) clearTimeout(timer);
      if (chunks.length === 0) return resolve(null);
      const blob = new Blob(chunks, { type: mimeFull });
      try {
        const data = await blobToBase64(blob);
        resolve({ mime: mimeFull.split(';')[0], data });
      } catch {
        resolve(null);
      }
    };
    recorder.onerror = () => resolve(null);
  });

  recorder.start();
  timer = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, maxMs);

  return {
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    done,
  };
}

/** base64 audio-г тоглуулна; дууссаны дараа resolve хийнэ. */
export function playBase64Audio(mime: string, data: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:${mime};base64,${data}`);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
}
