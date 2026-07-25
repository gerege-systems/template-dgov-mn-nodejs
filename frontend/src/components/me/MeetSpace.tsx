"use client";

import React, { useState } from 'react';
import { Video, Loader2, ExternalLink, Copy, Check } from 'lucide-react';
import { postJSON } from '@/lib/client';

interface MeetSpaceData {
  meetingUri?: string;
  meetingCode?: string;
}

// Google Meet холбогдсон карт дотор харагдах товч — дарвал апп шинэ видео
// уулзалт (space) үүсгэж, линкийг доор харуулна. Линкийг хуулах, шинэ цонхонд
// нээх боломжтой. Бүх дуудлага BFF route-оор дамжина (токен browser-т гарахгүй).
export default function MeetSpace() {
  const [creating, setCreating] = useState(false);
  const [meet, setMeet] = useState<MeetSpaceData | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setCreating(true);
    setErr('');
    const res = await postJSON<MeetSpaceData>('/api/integrations/google-meet/create-space', {});
    setCreating(false);
    if (res.ok && res.data?.meetingUri) setMeet(res.data);
    else setErr(res.message || 'Уулзалт үүсгэхэд алдаа гарлаа.');
  };

  const copy = async () => {
    if (!meet?.meetingUri) return;
    try {
      await navigator.clipboard.writeText(meet.meetingUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard зөвшөөрөл татгалзсан — алгасна */
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        className="btn btn--secondary btn--sm"
        type="button"
        onClick={create}
        disabled={creating}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {creating
          ? <><Loader2 size={14} className="spin" /> Үүсгэж байна…</>
          : <><Video size={14} /> Уулзалт үүсгэх</>}
      </button>

      {err && <div className="alert alert--danger" role="alert" style={{ margin: 0 }}>{err}</div>}

      {meet?.meetingUri && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 10px', borderRadius: 8,
            background: 'var(--surface-2, #f3f4f6)',
          }}
        >
          <span
            translate="no"
            style={{
              flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {meet.meetingCode || meet.meetingUri}
          </span>
          <button className="btn btn--ghost btn--sm" type="button" title="Хуулах" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <a
            className="btn btn--primary btn--sm"
            href={meet.meetingUri}
            target="_blank"
            rel="noreferrer"
            title="Уулзалтад орох"
          >
            <ExternalLink size={14} /> Орох
          </a>
        </div>
      )}
    </div>
  );
}
