"use client";

import React from 'react';
import { Check } from 'lucide-react';
import SegmentedControl from './SegmentedControl';
import {
  usePreferences,
  showToast,
  type AccentPref,
  type FontPref,
  type StylePref,
} from '@/lib/preferences';
import { useT } from '@/lib/lang';

const ACCENTS: AccentPref[] = ['cobalt', 'teal', 'violet', 'emerald', 'amber'];

interface Props {
  /** true үед гарчиг/тайлбаргүй зөвхөн удирдлагууд (topbar-д багтаах). */
  bare?: boolean;
}

/**
 * Харагдацын удирдлагууд — өнгөний хослол (accent swatch), фонт, нягтрал.
 * Утга бүр localStorage-д хадгалагдаж <html data-*>-аар токеныг дарж бичнэ
 * (usePreferences). Settings карт болон анонимос хуудсанд дахин ашиглагдана.
 */
export default function AppearanceControls({ bare }: Props) {
  const { T } = useT();
  const { accent, setAccent, font, setFont, style, setStyle } = usePreferences();

  const onAccent = (value: AccentPref) => {
    setAccent(value);
    showToast(T('appearance.applied'));
  };
  const onFont = (value: FontPref) => {
    setFont(value);
    showToast(T('appearance.applied'));
  };
  const onStyle = (value: StylePref) => {
    setStyle(value);
    showToast(T('appearance.applied'));
  };

  return (
    <div className={`appearance${bare ? ' appearance--bare' : ''}`}>
      <div className="appearance__row">
        <span className="appearance__label">{T('appearance.accent')}</span>
        <div className="accent-swatches" role="radiogroup" aria-label={T('appearance.accent')}>
          {ACCENTS.map((value) => {
            const active = value === accent;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={T(`accent.${value}` as Parameters<typeof T>[0])}
                title={T(`accent.${value}` as Parameters<typeof T>[0])}
                data-swatch={value}
                className={`accent-swatch${active ? ' is-active' : ''}`}
                onClick={() => onAccent(value)}
              >
                {active && <Check size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="appearance__row">
        <span className="appearance__label">{T('appearance.font')}</span>
        <SegmentedControl
          ariaLabel={T('appearance.font')}
          value={font}
          onChange={onFont}
          options={[
            { value: 'inter', label: T('font.inter') },
            { value: 'serif', label: T('font.serif') },
            { value: 'system', label: T('font.system') },
          ]}
        />
      </div>

      <div className="appearance__row">
        <span className="appearance__label">{T('appearance.density')}</span>
        <SegmentedControl
          ariaLabel={T('appearance.density')}
          value={style}
          onChange={onStyle}
          options={[
            { value: 'comfortable', label: T('density.comfortable') },
            { value: 'compact', label: T('density.compact') },
          ]}
        />
      </div>
    </div>
  );
}
