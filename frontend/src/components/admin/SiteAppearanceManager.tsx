"use client";

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Palette, Check, Save } from 'lucide-react';
import Alert from '@/components/Alert';
import SegmentedControl from '@/components/SegmentedControl';
import { getJSON, sendJSON } from '@/lib/client';
import { useT } from '@/lib/lang';
import type { SiteAppearance } from '@/lib/api';

const PRESETS = ['cobalt', 'teal', 'violet', 'emerald', 'amber'] as const;
type Preset = (typeof PRESETS)[number];
const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_CUSTOM = '#1767e7';

/**
 * Админы сайтын нийтийн харагдац (accent · font · style · theme) тохируулагч.
 * Backend-д (site_appearance) хадгална; бүх зочин үүгээр эхэлнэ, хэрэглэгч
 * өөрийн тохиргоогоор дарж болно. accent нь preset ЭСВЭЛ дурын '#rrggbb' hex.
 */
export default function SiteAppearanceManager() {
  const { T } = useT();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['site-appearance'],
    queryFn: () => getJSON<SiteAppearance>('/api/site/appearance'),
  });

  const [accent, setAccent] = useState<string>('cobalt'); // preset нэр эсвэл hex
  const [customHex, setCustomHex] = useState<string>(DEFAULT_CUSTOM);
  const [font, setFont] = useState<SiteAppearance['font']>('inter');
  const [style, setStyle] = useState<SiteAppearance['style']>('comfortable');
  const [theme, setTheme] = useState<SiteAppearance['theme']>('light');
  const [saved, setSaved] = useState(false);

  // Backend-ээс уншсан утгыг формд суулгах.
  useEffect(() => {
    const d = query.data;
    if (!d) return;
    setAccent(d.accent);
    if (HEX.test(d.accent)) setCustomHex(d.accent);
    setFont(d.font);
    setStyle(d.style);
    setTheme(d.theme);
  }, [query.data]);

  const isCustom = HEX.test(accent);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await sendJSON('/api/admin/site/appearance', 'PUT', { accent, font, style, theme });
      if (!res.ok) throw new Error(res.message || T('site.appearance.saveError'));
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['site-appearance'] });
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <section className="card" aria-label={T('site.appearance.title')}>
      <div className="card__head card__head--with-sub">
        <div className="card__title">
          <Palette size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} />
          <h2>{T('site.appearance.title')}</h2>
        </div>
        <span className="card__sub">{T('site.appearance.sub')}</span>
      </div>

      {query.isError && <Alert kind="danger">{T('site.appearance.loadError')}</Alert>}
      {saved && <Alert kind="success">{T('site.appearance.saved')}</Alert>}
      {mutation.isError && <Alert kind="danger">{(mutation.error as Error).message}</Alert>}

      <div className="appearance">
        {/* Өнгөний хослол — preset swatch-ууд + custom */}
        <div className="appearance__row">
          <span className="appearance__label">{T('site.appearance.accent')}</span>
          <div className="accent-swatches" role="radiogroup" aria-label={T('site.appearance.accent')}>
            {PRESETS.map((p) => {
              const active = accent === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={T(`accent.${p}` as Parameters<typeof T>[0])}
                  title={T(`accent.${p}` as Parameters<typeof T>[0])}
                  data-swatch={p}
                  className={`accent-swatch${active ? ' is-active' : ''}`}
                  onClick={() => setAccent(p)}
                >
                  {active && <Check size={13} strokeWidth={3} />}
                </button>
              );
            })}
            {/* Custom — сонгосон hex өнгийг харуулна, дарахад color picker */}
            <button
              type="button"
              role="radio"
              aria-checked={isCustom}
              aria-label={T('site.appearance.custom')}
              title={T('site.appearance.custom')}
              className={`accent-swatch accent-swatch--custom${isCustom ? ' is-active' : ''}`}
              style={isCustom ? { background: customHex } : undefined}
              onClick={() => setAccent(customHex)}
            >
              {isCustom && <Check size={13} strokeWidth={3} />}
            </button>
          </div>
        </div>

        {/* Custom сонгогдсон үед hex оруулах */}
        {isCustom && (
          <div className="appearance__row">
            <span className="appearance__label">{T('site.appearance.custom')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="color"
                aria-label={T('site.appearance.custom')}
                value={customHex}
                onChange={(e) => { setCustomHex(e.target.value); setAccent(e.target.value); }}
                className="color-input"
              />
              <span className="mono" style={{ fontSize: 13 }}>{customHex}</span>
            </div>
          </div>
        )}

        {/* Фонт */}
        <div className="appearance__row">
          <span className="appearance__label">{T('site.appearance.font')}</span>
          <SegmentedControl
            ariaLabel={T('site.appearance.font')}
            value={font}
            onChange={setFont}
            options={[
              { value: 'inter', label: T('font.inter') },
              { value: 'serif', label: T('font.serif') },
              { value: 'system', label: T('font.system') },
            ]}
          />
        </div>

        {/* Нягтрал */}
        <div className="appearance__row">
          <span className="appearance__label">{T('site.appearance.density')}</span>
          <SegmentedControl
            ariaLabel={T('site.appearance.density')}
            value={style}
            onChange={setStyle}
            options={[
              { value: 'comfortable', label: T('density.comfortable') },
              { value: 'compact', label: T('density.compact') },
            ]}
          />
        </div>

        {/* Загвар (light/dark/system) */}
        <div className="appearance__row">
          <span className="appearance__label">{T('site.appearance.theme')}</span>
          <SegmentedControl
            ariaLabel={T('site.appearance.theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: T('theme.light') },
              { value: 'dark', label: T('theme.dark') },
              { value: 'system', label: T('theme.system') },
            ]}
          />
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={mutation.isPending || query.isLoading}
            onClick={() => mutation.mutate()}
          >
            <Save size={16} strokeWidth={2} />
            <span>{mutation.isPending ? T('site.appearance.saving') : T('site.appearance.save')}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
