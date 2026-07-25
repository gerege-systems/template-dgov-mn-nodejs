"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import Alert from '@/components/Alert';
import SegmentedControl from '@/components/SegmentedControl';
import { sendJSON } from '@/lib/client';
import { useT, useLang } from '@/lib/lang';
import { landingCopy, type LandingCopy } from '@/components/landing/copy';
import {
  DEFAULT_PALETTE,
  THEME_COLOR_FIELDS,
  THEME_COLOR_VARS,
  deepMerge,
  type Theme,
  type ThemeColors,
  type ThemeConfig,
} from '@/lib/theme';

type Lang = 'mn' | 'en';

interface Props {
  /** Засах theme; null бол шинэ. */
  theme: Theme | null;
  onDone: () => void;
}

// ---- path-based get/set (override tree) ----------------------------------
type Json = Record<string, unknown>;
function getPath(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[k as string];
  }
  return cur;
}
function setPath<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const src = (obj && typeof obj === 'object' ? obj : {}) as Json | unknown[];
  if (typeof head === 'number' || Array.isArray(src)) {
    const arr = Array.isArray(src) ? [...(src as unknown[])] : [];
    arr[head as number] = setPath(arr[head as number], rest, value);
    return arr as unknown as T;
  }
  return { ...(src as Json), [head]: setPath((src as Json)[head as string], rest, value) } as T;
}

/**
 * ThemeEditor — нэг theme-ийн бүрэн засвар: харагдац (палетр · фонт · стиль ·
 * загвар) + landing-ийн бүх текст/цэс (mn/en, рекурсив) + шууд preview.
 */
export default function ThemeEditor({ theme, onDone }: Props) {
  const { T } = useT();
  const { lang: uiLang } = useLang();
  const L = (mn: string, en: string) => (uiLang === 'en' ? en : mn);

  const [name, setName] = useState(theme?.name ?? '');
  const [appearance, setAppearance] = useState<NonNullable<ThemeConfig['appearance']>>(
    () => theme?.config?.appearance ?? {},
  );
  const [landing, setLanding] = useState<NonNullable<ThemeConfig['landing']>>(
    () => theme?.config?.landing ?? {},
  );
  const [editLang, setEditLang] = useState<Lang>('mn');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const colors: ThemeColors = appearance.colors ?? {};
  const colorVal = (k: keyof ThemeColors) => colors[k] ?? DEFAULT_PALETTE[k];
  const setColor = (k: keyof ThemeColors, v: string) =>
    setAppearance((a) => ({ ...a, colors: { ...(a.colors ?? {}), [k]: v } }));

  const setLandingPath = (path: (string | number)[], value: unknown) =>
    setLanding((prev) => setPath(prev, [editLang, ...path], value));

  const mode = appearance.mode ?? 'light';
  const font = appearance.font ?? 'inter';
  const style = appearance.style ?? 'comfortable';

  // preview-д харуулах нэгдсэн (merge хийсэн) текст.
  const mergedCopy = useMemo<LandingCopy>(
    () => deepMerge(landingCopy[editLang], landing[editLang] ?? {}),
    [landing, editLang],
  );

  const save = async () => {
    if (!name.trim()) { setError(L('Нэр оруулна уу.', 'Enter a name.')); return; }
    setBusy(true);
    setError('');
    const config: ThemeConfig = { appearance, landing };
    // theme.id хоосон биш бол засвар (PUT); шинэ/clone бол үүсгэх (POST).
    const res = theme?.id
      ? await sendJSON(`/api/admin/themes/${theme.id}`, 'PUT', { name, config })
      : await sendJSON('/api/admin/themes', 'POST', { name, config });
    setBusy(false);
    if (res.ok) { onDone(); return; }
    setError(res.message || L('Хадгалахад алдаа гарлаа.', 'Failed to save.'));
  };

  // preview-ийн inline CSS хувьсагчид (base токенууд + цөөн derived).
  const previewVars = useMemo(() => {
    const v: Record<string, string> = {};
    for (const f of THEME_COLOR_FIELDS) v[THEME_COLOR_VARS[f.key]] = colorVal(f.key);
    v['--dan-blue-text'] = `color-mix(in oklab, ${colorVal('danBlue')}, ${mode === 'dark' ? 'white 26%' : 'black 10%'})`;
    return v as React.CSSProperties;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance, mode]);
  const previewFont =
    font === 'serif' ? 'var(--font-serif-stack), Georgia, serif'
      : font === 'system' ? '-apple-system, system-ui, sans-serif'
        : 'var(--font-body-stack), system-ui, sans-serif';

  return (
    <section className="card" aria-label={T('themes.editorTitle')} style={{ display: 'grid', gap: 20 }}>
      <div className="card__head card__head--with-sub">
        <div className="card__title"><h2>{theme?.id ? T('themes.edit') : T('themes.create')}</h2></div>
      </div>
      {error && <Alert kind="danger">{error}</Alert>}

      {/* Нэр */}
      <div className="form-grid">
        <label className="field">
          <span className="field__label">{T('themes.name')}</span>
          <input className="input" value={name} maxLength={80}
            onChange={(e) => setName(e.target.value)} placeholder={L('Жишээ: Шинэ жилийн', 'e.g. New Year')} />
        </label>
      </div>

      <div className="theme-editor__grid">
        {/* ЗҮҮН: удирдлагууд */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {/* Харагдац */}
          <div className="theme-section">
            <h3>{T('themes.appearance')}</h3>
            <div className="appearance__row">
              <span className="appearance__label">{T('site.appearance.theme')}</span>
              <SegmentedControl ariaLabel={T('site.appearance.theme')} value={mode}
                onChange={(v) => setAppearance((a) => ({ ...a, mode: v }))}
                options={[
                  { value: 'light', label: T('theme.light') },
                  { value: 'dark', label: T('theme.dark') },
                  { value: 'system', label: T('theme.system') },
                ]} />
            </div>
            <div className="appearance__row">
              <span className="appearance__label">{T('site.appearance.font')}</span>
              <SegmentedControl ariaLabel={T('site.appearance.font')} value={font}
                onChange={(v) => setAppearance((a) => ({ ...a, font: v }))}
                options={[
                  { value: 'inter', label: T('font.inter') },
                  { value: 'serif', label: T('font.serif') },
                  { value: 'system', label: T('font.system') },
                ]} />
            </div>
            <div className="appearance__row">
              <span className="appearance__label">{T('site.appearance.density')}</span>
              <SegmentedControl ariaLabel={T('site.appearance.density')} value={style}
                onChange={(v) => setAppearance((a) => ({ ...a, style: v }))}
                options={[
                  { value: 'comfortable', label: T('density.comfortable') },
                  { value: 'compact', label: T('density.compact') },
                ]} />
            </div>
            <div className="color-grid">
              {THEME_COLOR_FIELDS.map((f) => (
                <ColorField key={f.key} value={colorVal(f.key)} label={L(f.labelMn, f.labelEn)}
                  onChange={(v) => setColor(f.key, v)} />
              ))}
            </div>
          </div>

          {/* Контент */}
          <div className="theme-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3>{T('themes.content')}</h3>
              <SegmentedControl ariaLabel="lang" value={editLang} onChange={setEditLang}
                options={[{ value: 'mn', label: 'МН' }, { value: 'en', label: 'EN' }]} />
            </div>
            <CopyFields def={landingCopy[editLang] as unknown as Json}
              override={(landing[editLang] ?? {}) as Json}
              path={[]} onSet={setLandingPath} />
          </div>
        </div>

        {/* БАРУУН: preview */}
        <div className="theme-preview" data-theme={mode === 'dark' ? 'dark' : undefined}
          style={{ ...previewVars, fontFamily: previewFont }}>
          <div className="theme-preview__bar">{T('themes.preview')}</div>
          <div className="theme-preview__body">
            {/* Landing толгой (--lp-header) ба үлдсэн (--lp-navy) дэвсгэрийг тусад
                нь харуулах mini-preview — хоёр өнгийг зэрэгцүүлж шалгах. */}
            <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 12, fontSize: 11, fontWeight: 600 }}>
              <div style={{
                background: 'var(--lp-header)', color: '#f7f9fc',
                padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 7,
                borderBottom: '1px solid rgba(255,255,255,0.12)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />
                {L('Толгой (header)', 'Header')}
              </div>
              <div style={{ background: 'var(--lp-navy)', color: '#dfe6f2', padding: '11px 11px 14px' }}>
                {L('Үлдсэн (body)', 'Body')}
              </div>
            </div>
            <div className="theme-preview__brand">{mergedCopy.brand || 'Government Template Platform V3.0'}</div>
            <div className="theme-preview__hero">
              {mergedCopy.hero.titleLead} <span style={{ color: 'var(--gold)' }}>{mergedCopy.hero.titleAccent}</span> {mergedCopy.hero.titleTail}
            </div>
            <p className="theme-preview__lede">{mergedCopy.hero.lede}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="theme-preview__btn" style={{ background: 'var(--dan-blue)', color: '#fff' }}>{mergedCopy.hero.ctaLogin}</span>
              <span className="theme-preview__btn" style={{ background: 'var(--gold)', color: '#1a1205' }}>{mergedCopy.nav.login}</span>
            </div>
            <div className="theme-preview__nav">
              {mergedCopy.nav.features} · {mergedCopy.nav.security} · {mergedCopy.nav.tech}
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn--primary" type="button" disabled={busy} onClick={save}>
          <Save size={16} strokeWidth={2} /><span>{busy ? T('site.appearance.saving') : T('themes.save')}</span>
        </button>
        <button className="btn btn--secondary" type="button" onClick={onDone}>
          <X size={16} strokeWidth={2} /><span>{T('themes.cancel')}</span>
        </button>
      </div>
    </section>
  );
}

// ---- өнгө сонгогч ----------------------------------------------------------
// Бэлэн палитр. 1 дарахад энэ палитраас сонгоно (найдвартай — цэвэр товч);
// хос дарахад (double-click) OS-ийн бүрэн өнгө сонгогч нээгдэнэ.
const PRESET_COLORS = [
  '#1767e7', '#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e', '#84cc16', '#eab308',
  '#f59e0b', '#f97316', '#ef4444', '#e11d48', '#ec4899', '#a855f7', '#8b5cf6', '#6366f1',
  '#c39a4e', '#0f1f39', '#111827', '#1f2937', '#374151', '#64748b', '#9ca3af', '#cbd5e1',
  '#e5e7eb', '#f1f3f6', '#ffffff', '#000000',
];

/**
 * ColorField — найдвартай өнгө сонгогч. Swatch дээр:
 *  • 1 дарахад бэлэн палитрын popover нээгдэж, дарж сонгоно (цэвэр товч тул
 *    native picker-ийн эвдрэлгүй),
 *  • хос дарахад OS-ийн бүрэн өнгө сонгогч (input[type=color]) нээгдэнэ.
 */
function ColorField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openNative = () => {
    const el = nativeRef.current;
    if (!el) return;
    try { el.value = value; } catch { /* noop */ }
    el.click();
  };
  // Хос дарахаас ялгахын тулд ганц дарахыг бага зэрэг хойшлуулна.
  const onSwatchClick = () => {
    if (clickTimer.current) return;
    clickTimer.current = setTimeout(() => { clickTimer.current = undefined; setOpen((o) => !o); }, 200);
  };
  const onSwatchDouble = () => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = undefined; }
    setOpen(false);
    openNative();
  };

  return (
    <div className={`cfield${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button type="button" className="cfield__swatch" style={{ background: value }}
        onClick={onSwatchClick} onDoubleClick={onSwatchDouble}
        aria-label={label} title={`${label} — 1 дарж палитр, хос дарж бүрэн сонгогч`} />
      <span className="cfield__label">{label}</span>
      {/* OS-ийн бүрэн сонгогч — нуугдмал, хос дарахад програмаар нээнэ */}
      <input ref={nativeRef} type="color" className="cfield__native" defaultValue={value}
        tabIndex={-1} aria-hidden="true" onChange={(e) => onChange(e.target.value)} />
      {open && (
        <div className="cfield__pop" role="menu">
          <div className="cfield__grid">
            {PRESET_COLORS.map((c) => (
              <button key={c} type="button" className="cfield__preset" style={{ background: c }}
                aria-label={c} title={c} onClick={() => { onChange(c); setOpen(false); }} />
            ))}
          </div>
          <button type="button" className="cfield__more" onClick={() => { setOpen(false); openNative(); }}>
            Бусад өнгө…
          </button>
        </div>
      )}
    </div>
  );
}

// ---- рекурсив текст засварлагч --------------------------------------------
function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function CopyFields({
  def, override, path, onSet,
}: {
  def: unknown;
  override: unknown;
  path: (string | number)[];
  onSet: (path: (string | number)[], value: unknown) => void;
}) {
  // Массив — cur-ыг ҮРГЭЛЖ нягт (dense) бүтэн массив болгоно (нүхийг def-ээс
  // дүүргэж, def-ийн уртаар сунгана) тул зөвхөн нэг мөр засахад бусад нь алга
  // болохгүй. Засвар/нэмэх/устгах бүр бүтэн массивыг path-д бичнэ.
  if (Array.isArray(def)) {
    const dbase = def as unknown[];
    const itemTemplate = dbase[0];
    const ov = Array.isArray(override) ? (override as unknown[]) : null;
    const len = ov ? Math.max(dbase.length, ov.length) : dbase.length;
    const cur: unknown[] = Array.from({ length: len }, (_, i) => {
      const o = ov ? ov[i] : undefined;
      return o === undefined || o === null ? dbase[i] ?? structuredClone(itemTemplate) : o;
    });
    const writeItem = (i: number, newItem: unknown) => onSet(path, cur.map((it, j) => (j === i ? newItem : it)));
    return (
      <div className="copy-array">
        {cur.map((item, i) => (
          <div key={i} className="copy-array__item">
            <div className="copy-array__head">
              <span>#{i + 1}</span>
              <button type="button" className="icon-btn" aria-label="remove"
                onClick={() => onSet(path, cur.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
            <CopyFields def={itemTemplate} override={item} path={[]}
              onSet={(sub, val) => writeItem(i, setPath(item ?? structuredClone(itemTemplate), sub, val))} />
          </div>
        ))}
        <button type="button" className="btn btn--secondary btn--sm"
          onClick={() => onSet(path, [...cur, structuredClone(itemTemplate)])}>
          <Plus size={14} /><span>+</span>
        </button>
      </div>
    );
  }
  // Объект
  if (def && typeof def === 'object') {
    const d = def as Json;
    const o = (override && typeof override === 'object' ? override : {}) as Json;
    return (
      <div className="copy-group">
        {Object.keys(d).map((k) => {
          const child = d[k];
          const isLeaf = typeof child === 'string';
          return (
            <div key={k} className={isLeaf ? 'copy-leaf' : 'copy-nest'}>
              {!isLeaf && <div className="copy-nest__label">{humanize(k)}</div>}
              {isLeaf ? (
                <label className="field">
                  <span className="field__label">{humanize(k)}</span>
                  <textarea className="input copy-textarea" rows={String(o[k] ?? child).length > 60 ? 3 : 1}
                    value={String(o[k] ?? child)} onChange={(e) => onSet([...path, k], e.target.value)} />
                </label>
              ) : (
                <CopyFields def={child} override={o[k]} path={[...path, k]} onSet={onSet} />
              )}
            </div>
          );
        })}
      </div>
    );
  }
  // Leaf (жишээ массивын доторх мөр)
  return (
    <label className="field">
      <textarea className="input copy-textarea" rows={1}
        value={String(override ?? def ?? '')} onChange={(e) => onSet(path, e.target.value)} />
    </label>
  );
}
