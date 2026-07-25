"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Bot, Mic, Send, Square, Volume2, Wrench } from 'lucide-react';
import PageHead from '@/components/PageHead';
import { useT } from '@/lib/lang';
import { postJSON } from '@/lib/client';
import { recordSegment, playBase64Audio, type RecordedAudio } from '@/lib/audio';

interface ChatMsg {
  role: 'user' | 'model';
  text: string;
  /** AI-ийн ашигласан backend функцууд (pipeline steps). */
  tools?: string[];
  /** Алдаа / fallback хариу — дараагийн хүсэлтийн history-д орохгүй. */
  degraded?: boolean;
  /** Дуут мессеж байсан эсэх (history-д placeholder текстээр явна). */
  voice?: boolean;
}

interface ChatData {
  reply?: string;
  steps?: { tool?: string }[];
  degraded?: boolean;
}

const MAX_VOICE_MS = 30000;

/**
 * AI туслахын чат — текст болон дуут мессеж (mic) дэмжинэ; AI хариуг
 * TTS-ээр сонсож болно. Мессежүүдийг client талд барьж (stateless backend),
 * /api/ai/* BFF route-уудаар Gemini pipeline руу илгээнэ.
 */
export default function AiChatView() {
  const { T } = useT();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  // Компонент unmount үед микрофоныг суллана.
  useEffect(() => {
    return () => {
      segmentRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function historyOf(msgs: ChatMsg[]) {
    return msgs
      .filter((m) => !m.degraded)
      .map((m) => ({ role: m.role, text: m.text }))
      .slice(-20);
  }

  async function dispatch(payload: { message?: string; audio?: RecordedAudio }, userBubble: ChatMsg) {
    const history = historyOf(messages);
    setMessages((m) => [...m, userBubble]);
    setBusy(true);
    try {
      const body = await postJSON<ChatData>('/api/ai/chat', { ...payload, history });
      if (body?.ok && body.data?.reply) {
        const tools = (body.data.steps ?? [])
          .map((s) => s.tool)
          .filter((t): t is string => typeof t === 'string' && t.length > 0);
        setMessages((m) => [
          ...m,
          { role: 'model', text: body.data?.reply ?? '', tools, degraded: body.data?.degraded },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: 'model', text: body?.message || T('ai.error'), degraded: true },
        ]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'model', text: T('ai.error'), degraded: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || recording) return;
    setInput('');
    await dispatch({ message: text }, { role: 'user', text });
  }

  async function toggleRecord() {
    if (busy) return;
    if (recording) {
      segmentRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setRecording(true);
      const seg = recordSegment(stream, MAX_VOICE_MS);
      segmentRef.current = seg;
      const audio = await seg.done;
      setRecording(false);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (audio) {
        await dispatch({ audio }, { role: 'user', text: T('ai.voiceMsg'), voice: true });
      }
    } catch {
      setRecording(false);
      setMessages((m) => [...m, { role: 'model', text: T('ai.micError'), degraded: true }]);
    }
  }

  async function speak(idx: number, text: string) {
    if (speakingIdx !== null) return;
    setSpeakingIdx(idx);
    try {
      const body = await postJSON<{ mime?: string; data?: string }>('/api/ai/tts', {
        text: text.slice(0, 2000),
      });
      if (body.ok && body.data?.mime && body.data?.data) {
        await playBase64Audio(body.data.mime, body.data.data);
      }
    } catch {
      /* TTS унавал чимээгүй өнгөрнө */
    } finally {
      setSpeakingIdx(null);
    }
  }

  return (
    <>
      <PageHead eyebrowKey="me.ai.eyebrow" titleKey="me.ai.title" subKey="me.ai.sub" />

      <div className="card aichat">
        <div className="aichat__scroll" aria-live="polite">
          {messages.length === 0 && !busy && (
            <div className="aichat__empty">
              <Bot size={28} strokeWidth={1.6} />
              <p>{T('ai.empty')}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`aichat__msg aichat__msg--${m.role}${m.degraded ? ' is-degraded' : ''}`}>
              <div className="aichat__bubble">
                {m.voice && <Mic size={13} strokeWidth={2} className="aichat__voice-ico" />}
                {m.text}
              </div>
              <span className="aichat__meta">
                {m.role === 'model' && !m.degraded && (
                  <button
                    type="button"
                    className="aichat__iconbtn"
                    title={T('ai.listen')}
                    aria-label={T('ai.listen')}
                    disabled={speakingIdx !== null}
                    onClick={() => speak(i, m.text)}
                  >
                    <Volume2 size={14} strokeWidth={2} className={speakingIdx === i ? 'aichat__speaking' : undefined} />
                  </button>
                )}
                {m.tools && m.tools.length > 0 && (
                  <span className="aichat__tools">
                    <Wrench size={12} strokeWidth={2} /> {T('ai.tools')} {m.tools.join(', ')}
                  </span>
                )}
              </span>
            </div>
          ))}
          {busy && (
            <div className="aichat__msg aichat__msg--model">
              <div className="aichat__bubble aichat__bubble--pending">{T('ai.thinking')}</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="aichat__form" onSubmit={sendText}>
          <button
            type="button"
            className={`btn btn--secondary aichat__mic${recording ? ' is-recording' : ''}`}
            title={recording ? T('ai.recordStop') : T('ai.record')}
            aria-label={recording ? T('ai.recordStop') : T('ai.record')}
            disabled={busy}
            onClick={toggleRecord}
          >
            {recording ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
          </button>
          <input
            className="input aichat__input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={recording ? T('ai.recording') : T('ai.placeholder')}
            maxLength={4000}
            disabled={busy || recording}
            autoComplete="off"
          />
          <button className="btn btn--primary" type="submit" disabled={busy || recording || !input.trim()}>
            <Send size={16} strokeWidth={2} />
            <span>{T('ai.send')}</span>
          </button>
        </form>
      </div>
    </>
  );
}
