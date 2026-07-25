"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HardDrive, Box, Video, CheckCircle2, AlertCircle, Clock, Plus, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { postJSON } from '@/lib/client';
import type { IntegrationStatus, IntegrationID } from '@/lib/integrations';
import DriveFiles from './DriveFiles';
import DropboxFiles from './DropboxFiles';
import MeetSpace from './MeetSpace';
import GSpaceCard from './GSpaceCard';

const ICONS: Record<IntegrationID, LucideIcon> = {
  'google-drive': HardDrive,
  dropbox: Box,
  'google-meet': Video,
};

// Карт дээрх жижиг ангилал (брэндийн доорх 2 дахь мөр).
const CATEGORIES: Record<IntegrationID, string> = {
  'google-drive': 'Файл хадгалалт',
  dropbox: 'Файл хадгалалт',
  'google-meet': 'Видео уулзалт',
};

const DESCRIPTIONS: Record<IntegrationID, string> = {
  'google-drive': 'Баримтаа Google Drive-д хадгалж, eID-ээр баталгаажуулсан файлаа холбоно.',
  dropbox: 'Dropbox дахь файлдаа хандаж, гарын үсэгт баримтыг синк хийнэ.',
  'google-meet': 'eID хуралд Google Meet-ийн видео уулзалтыг шууд үүсгэнэ.',
};

type GoogleLoginStatus = { configured: boolean; connected: boolean; email: string; name: string; picture: string };

export default function EidIntegrationsView({ items, google }: { items: IntegrationStatus[]; google?: GoogleLoginStatus }) {
  const router = useRouter();
  const params = useSearchParams();
  const connectedParam = params.get('connected');
  const error = params.get('error');
  const errorProvider = params.get('provider');
  const [pending, setPending] = React.useState<IntegrationID | null>(null);
  const [googleBusy, setGoogleBusy] = React.useState(false);
  const [actionErr, setActionErr] = React.useState('');

  async function disconnect(id: IntegrationID) {
    if (!window.confirm('Энэ холболтыг салгах уу?')) return;
    setPending(id);
    setActionErr('');
    const res = await postJSON(`/api/integrations/${id}/disconnect`, {});
    setPending(null);
    if (res.ok) router.refresh();
    else setActionErr(res.message || 'Салгахад алдаа гарлаа. Дахин оролдоно уу.');
  }

  async function disconnectGoogle() {
    if (!window.confirm('Google холболтыг салгах уу? Дараа нь Google-ээр нэвтрэх боломжгүй болно.')) return;
    setGoogleBusy(true);
    setActionErr('');
    const res = await postJSON('/api/integrations/google-login/disconnect', {});
    setGoogleBusy(false);
    if (res.ok) router.refresh();
    else setActionErr(res.message || 'Салгахад алдаа гарлаа. Дахин оролдоно уу.');
  }

  const errorText = (e: string) =>
    e === 'not_configured' ? 'Энэ үйлчилгээ хараахан тохируулагдаагүй байна.'
      : e === 'denied' ? 'Та зөвшөөрлийг цуцалсан байна.'
      : e === 'invalid_state' ? 'Аюулгүй байдлын шалгалт амжилтгүй. Дахин оролдоно уу.'
      : e === 'exchange_failed' ? 'Токен солилцоо амжилтгүй. Дахин оролдоно уу.'
      : e === 'store_failed' ? 'Токен хадгалахад алдаа гарлаа. Дахин оролдоно уу.'
      : e === 'conflict' ? 'Энэ Google бүртгэл өөр хэрэглэгчид холбогдсон байна.'
      : 'Тодорхойгүй алдаа гарлаа.';

  return (
    <>
      {connectedParam && (
        <div className="alert" role="status" style={{ borderLeft: '3px solid var(--success, #16a34a)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} style={{ color: 'var(--success, #16a34a)' }} />
          <span translate="no">{connectedParam}</span>&nbsp;амжилттай холбогдлоо.
        </div>
      )}
      {error && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />
          {errorText(error)}{errorProvider ? ` (${errorProvider})` : ''}
        </div>
      )}
      {actionErr && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} /> {actionErr}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        {/* Gerege Space — апп-ын өөрийн SFTP хадгалалт. OAuth-гүй, үргэлж холбогдсон;
            хэрэглэгч бүрт 2MB зай. Хамгийн эхэнд байрлана. */}
        <GSpaceCard />

        {/* Google Login — бусад интеграцтай ижил карт, гэхдээ token биш identity
            холболт (users.google_sub). Холбох = OAuth → одоогийн хэрэглэгчид уях. */}
        {google && (
          <div className="card int-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span aria-hidden style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2, #f3f4f6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17z"/><path fill="#FBBC05" d="M10.4 28.3a14.5 14.5 0 0 1 0-8.6l-7.8-6.1a24 24 0 0 0 0 20.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.4 0-11.8-3.8-13.6-9.3l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div translate="no" style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>Google</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Нэвтрэлт</div>
              </div>
              {/* Google холболтыг зөвхөн login-оос хийнэ. Энд зөвхөн САЛГАНА
                  (холбогдсон бол ✓). Холбоогүй үед үйлдлийн товчгүй. */}
              {google.connected && (
                <button type="button" onClick={disconnectGoogle} disabled={googleBusy} title="Салгах" aria-label="Салгах"
                  className="int-card__action int-card__action--connected"
                  style={{ flex: '0 0 auto', width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--success, #16a34a)', background: 'var(--card, #fff)', color: 'var(--success, #16a34a)', cursor: 'pointer', opacity: googleBusy ? 0.5 : 1 }}>
                  {googleBusy ? <Clock size={16} /> : <Check size={16} strokeWidth={2.5} />}
                </button>
              )}
            </div>

            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
              {google.connected
                ? 'Google бүртгэл холбогдсон. Салгахыг хүсвэл баруун дээд ✓-г дарна уу.'
                : 'Google холболтыг нэвтрэх хуудсанд Google-ээр нэвтрэх үедээ хийнэ.'}
            </p>

            {google.connected ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success, #16a34a)', fontWeight: 600 }}>
                <CheckCircle2 size={13} /> Холбогдсон{google.email ? <span className="mono" style={{ color: 'var(--muted)', fontWeight: 400 }}>· {google.email}</span> : null}
              </span>
            ) : null}
          </div>
        )}

        {items.map((it) => {
          const Icon = ICONS[it.id];
          const busy = pending === it.id;
          return (
            <div
              key={it.id}
              className="card int-card"
              style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  aria-hidden
                  style={{
                    flex: '0 0 auto', width: 40, height: 40, borderRadius: 10,
                    background: 'var(--surface-2, #f3f4f6)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--fg)',
                  }}
                >
                  <Icon size={20} strokeWidth={2} />
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div translate="no" style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{CATEGORIES[it.id]}</div>
                </div>

                <ActionButton
                  status={it}
                  busy={busy}
                  onDisconnect={() => disconnect(it.id)}
                />
              </div>

              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                {DESCRIPTIONS[it.id]}
              </p>

              {it.connected && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success, #16a34a)', fontWeight: 600 }}>
                  <CheckCircle2 size={13} /> Холбогдсон
                </span>
              )}
              {!it.configured && !it.connected && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                  <Clock size={13} /> Удахгүй
                </span>
              )}

              {/* Google Drive холбогдсон үед — card дотор "Файл нээх" товч,
                  бүх үйлдэл popup (Dialog) дотор. */}
              {it.id === 'google-drive' && it.connected && <DriveFiles />}

              {/* Dropbox холбогдсон үед — "Файл нээх" popup (/Gerege хавтас). */}
              {it.id === 'dropbox' && it.connected && <DropboxFiles />}

              {/* Google Meet холбогдсон үед — "Уулзалт үүсгэх" товч; шинэ видео
                  уулзалт үүсгээд линкийг тэндээ харуулна. */}
              {it.id === 'google-meet' && it.connected && <MeetSpace />}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Баруун дээд буланд дугуй үйлдлийн товч: холбох (+) / холбогдсон (✓, дарвал
// салгана) / тохируулаагүй (⏷ идэвхгүй).
function ActionButton({
  status, busy, onDisconnect,
}: { status: IntegrationStatus; busy: boolean; onDisconnect: () => void }) {
  const base: React.CSSProperties = {
    flex: '0 0 auto', width: 32, height: 32, borderRadius: 8,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid var(--border, #e5e7eb)', background: 'var(--card, #fff)',
    cursor: 'pointer', textDecoration: 'none', color: 'var(--fg)',
  };

  if (status.connected) {
    return (
      <button
        type="button"
        onClick={onDisconnect}
        disabled={busy}
        title="Салгах"
        aria-label="Салгах"
        className="int-card__action int-card__action--connected"
        style={{
          ...base,
          borderColor: 'var(--success, #16a34a)',
          color: 'var(--success, #16a34a)',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? <Clock size={16} /> : <Check size={16} strokeWidth={2.5} />}
      </button>
    );
  }

  if (status.configured) {
    return (
      <a
        href={`/api/integrations/${status.id}/connect`}
        title="Холбох"
        aria-label="Холбох"
        className="int-card__action"
        style={{ ...base, borderColor: 'var(--dan-blue-text, #2563eb)', color: 'var(--dan-blue-text, #2563eb)' }}
      >
        <Plus size={18} strokeWidth={2.5} />
      </a>
    );
  }

  return (
    <span
      title="Удахгүй тохируулагдана"
      aria-label="Удахгүй"
      style={{ ...base, cursor: 'not-allowed', color: 'var(--muted)', opacity: 0.6 }}
    >
      <Plus size={18} strokeWidth={2} />
    </span>
  );
}
