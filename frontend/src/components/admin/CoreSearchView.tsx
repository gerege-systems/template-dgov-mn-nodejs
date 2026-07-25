"use client";

import React, { useState } from 'react';
import { Search, User, Building2, Loader2, Inbox } from 'lucide-react';
import { getJSON } from '@/lib/client';

type Mode = 'user' | 'org';
type Rec = Record<string, unknown>;

const str = (v: unknown) => (v == null || v === '' ? '—' : String(v));

function gender(v: unknown) {
  if (v === 1 || v === '1') return 'Эрэгтэй';
  if (v === 2 || v === '2') return 'Эмэгтэй';
  return '—';
}
function date(v: unknown) {
  if (typeof v !== 'string' || !v) return '—';
  try { return new Date(v).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return v; }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="defrow defrow--wide">
      <span className="defrow__label">{label}</span>
      <span className="defrow__value" translate="no">{value}</span>
    </div>
  );
}

export default function CoreSearchView() {
  const [mode, setMode] = useState<Mode>('user');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Rec | null>(null);
  const [msg, setMsg] = useState('');

  const placeholder = mode === 'user' ? 'Регистрийн дугаар (ж: МА74101813) эсвэл core_id' : 'Байгууллагын регистр (ж: 6235972)';

  const search = async () => {
    const text = q.trim();
    if (!text) return;
    setLoading(true); setMsg(''); setResult(null);
    try {
      const path = mode === 'user' ? 'users' : 'organizations';
      const data = await getJSON<Rec>(`/api/core/${path}?search_text=${encodeURIComponent(text)}`);
      if (data && data.id != null) setResult(data);
      else setMsg(typeof data?.message === 'string' ? data.message : 'Илэрц олдсонгүй.');
    } catch (e) {
      setMsg((e as Error).message || 'Олдсонгүй эсвэл алдаа гарлаа.');
    } finally {
      setLoading(false);
    }
  };

  const onMode = (m: Mode) => { setMode(m); setResult(null); setMsg(''); };

  return (
    <>
      <div className="segmented" role="tablist" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={mode === 'user'} className={`segmented__item${mode === 'user' ? ' is-active' : ''}`} onClick={() => onMode('user')}>
          <User size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Хэрэглэгч
        </button>
        <button type="button" role="tab" aria-selected={mode === 'org'} className={`segmented__item${mode === 'org' ? ' is-active' : ''}`} onClick={() => onMode('org')}>
          <Building2 size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Байгууллага
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 560 }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button className="btn btn--primary" type="button" onClick={search} disabled={loading || !q.trim()}>
          {loading ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Хайх
        </button>
      </div>

      {msg && (
        <div className="card" style={{ padding: 20, margin: 0 }}>
          <p className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0 }}><Inbox size={15} /> {msg}</p>
        </div>
      )}

      {result && mode === 'user' && (
        <section className="card" style={{ margin: 0 }}>
          <div className="card__head"><div className="card__title"><User size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{str(result.last_name)} {str(result.first_name)}</h2></div></div>
          <div>
            <Row label="Core ID" value={<span className="mono">{str(result.id)}</span>} />
            <Row label="Регистрийн дугаар" value={<span className="mono">{String(result.reg_no ?? '—').toUpperCase()}</span>} />
            <Row label="Овог" value={str(result.family_name)} />
            <Row label="Эцэг/эхийн нэр" value={str(result.last_name)} />
            <Row label="Нэр" value={str(result.first_name)} />
            <Row label="Хүйс" value={gender(result.gender)} />
            <Row label="Төрсөн огноо" value={date(result.birth_date)} />
            <Row label="И-мэйл" value={<span className="mono">{str(result.email)}</span>} />
            <Row label="Утас" value={<span className="mono">{str(result.phone_no)}</span>} />
            <Row label="Хаяг" value={str(result.address_detail)} />
            <Row label="Иргэншил" value={str(result.country_name)} />
          </div>
        </section>
      )}

      {result && mode === 'org' && (
        <section className="card" style={{ margin: 0 }}>
          <div className="card__head"><div className="card__title"><Building2 size={18} style={{ color: 'var(--dan-blue-text)' }} /><h2>{str(result.name)}</h2></div></div>
          <div>
            <Row label="Core ID" value={<span className="mono">{str(result.id)}</span>} />
            <Row label="Регистрийн дугаар" value={<span className="mono">{str(result.reg_no)}</span>} />
            <Row label="Нэр" value={str(result.name)} />
            <Row label="Товч нэр" value={str(result.short_name)} />
            <Row label="И-мэйл" value={<span className="mono">{str(result.email)}</span>} />
            <Row label="Утас" value={<span className="mono">{str(result.phone_no)}</span>} />
            <Row label="Хаяг" value={str(result.address_detail)} />
            <Row label="Улс" value={str(result.country_name)} />
            <Row label="Бүртгэгдсэн" value={date(result.created_date)} />
          </div>
        </section>
      )}
    </>
  );
}
