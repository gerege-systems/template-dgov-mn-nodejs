"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Languages, Mic, Square, Volume2 } from 'lucide-react';
import PageHead from '@/components/PageHead';
import { useT } from '@/lib/lang';
import { postJSON } from '@/lib/client';
import { recordSegment, playBase64Audio } from '@/lib/audio';

interface TranslateRow {
  source: string;
  translated: string;
}

const TARGETS = [
  { code: 'mn', label: 'Монгол' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'de', label: 'Deutsch' },
];

// Сегментийн урт: богино бол хариу хурдан, урт бол өгүүлбэр бүтэн гардаг.
// 7с нь backend-ийн /ai rate limit (20/мин)-д урт хугацаанд багтана.
const SEGMENT_MS = 7000;

/**
 * Шууд (live) орчуулга — микрофоныг асаахад яриаг ~7 секундын сегментүүдээр
 * бичиж, сегмент бүрийг /api/ai/translate руу илгээнэ (STT → орчуулга,
 * сонголтоор TTS). Эх хэл автоматаар танигдана; зорилтот хэлийг сонгоно.
 */
export default function LiveTranslateView() {
  const { T } = useT();
  const [target, setTarget] = useState('en');
  const [speak, setSpeak] = useState(false);
  const [live, setLive] = useState(false);
  const [pending, setPending] = useState(0);
  const [rows, setRows] = useState<TranslateRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const liveRef = useRef(false);
  const segmentRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [rows, pending]);

  useEffect(() => {
    return () => stopLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopLive() {
    liveRef.current = false;
    setLive(false);
    segmentRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function translateChunk(mime: string, data: string, targetLang: string, withSpeak: boolean) {
    setPending((p) => p + 1);
    try {
      const body = await postJSON<{
        source_text?: string;
        translated?: string;
        audio?: { mime: string; data: string };
      }>('/api/ai/translate', { audio: { mime, data }, target_lang: targetLang, speak: withSpeak });
      const d = body.data;
      if (body.ok && d?.translated) {
        setRows((r) => [...r, { source: d.source_text ?? '', translated: d.translated ?? '' }]);
        if (withSpeak && d.audio) void playBase64Audio(d.audio.mime, d.audio.data);
      } else if (!body.ok) {
        // Чимээгүй сегмент (хоосон үр дүн) нь ok=true тул энд орохгүй;
        // зөвхөн бодит алдааг харуулна.
        setError(body.message || T('ai.error'));
      }
    } catch {
      setError(T('ai.error'));
    } finally {
      setPending((p) => p - 1);
    }
  }

  async function startLive() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      liveRef.current = true;
      setLive(true);
      // Сегментийн давталт: бичих → илгээх (хариуг хүлээлгүй) → дахин бичих.
      while (liveRef.current) {
        const seg = recordSegment(stream, SEGMENT_MS);
        segmentRef.current = seg;
        const audio = await seg.done;
        if (audio && liveRef.current) {
          void translateChunk(audio.mime, audio.data, target, speak);
        }
      }
    } catch {
      setError(T('ai.micError'));
      stopLive();
    }
  }

  return (
    <>
      <PageHead eyebrowKey="me.tr.eyebrow" titleKey="me.tr.title" subKey="me.tr.sub" />

      <div className="card aichat">
        <div className="aichat__toolbar">
          <label className="aichat__lang">
            <Languages size={16} strokeWidth={2} />
            <span>{T('tr.target')}</span>
            <select
              className="select"
              value={target}
              disabled={live}
              onChange={(e) => setTarget(e.target.value)}
            >
              {TARGETS.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="aichat__speak">
            <input type="checkbox" checked={speak} disabled={live} onChange={(e) => setSpeak(e.target.checked)} />
            <Volume2 size={15} strokeWidth={2} />
            <span>{T('tr.speak')}</span>
          </label>
          <div className="aichat__toolbar-spacer" />
          <button
            type="button"
            className={`btn ${live ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => (live ? stopLive() : void startLive())}
          >
            {live ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
            <span>{live ? T('tr.stop') : T('tr.start')}</span>
          </button>
        </div>

        <div className="aichat__scroll" aria-live="polite">
          {rows.length === 0 && !live && pending === 0 && (
            <div className="aichat__empty">
              <Languages size={28} strokeWidth={1.6} />
              <p>{T('tr.empty')}</p>
            </div>
          )}
          {rows.map((row, i) => (
            <div key={i} className="trrow">
              <div className="trrow__source">{row.source}</div>
              <div className="trrow__translated">{row.translated}</div>
            </div>
          ))}
          {(live || pending > 0) && (
            <div className="aichat__msg aichat__msg--model">
              <div className="aichat__bubble aichat__bubble--pending">
                {pending > 0 ? T('tr.translating') : T('tr.listening')}
              </div>
            </div>
          )}
          {error && <div className="aichat__error">{error}</div>}
          <div ref={endRef} />
        </div>
      </div>
    </>
  );
}
