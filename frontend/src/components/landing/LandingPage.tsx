// Government Template Platform V3.0
// Gerege Systems Development Team & Claude AI, 2026
"use client";

import React from 'react';
import {
  Fingerprint, Sparkles, ShieldCheck, Network, Waypoints, Users,
  Terminal, Layers, Bot, CheckCircle2, ArrowRight,
  LogIn, Languages, KeyRound, ScrollText, Globe, Gauge, ShieldAlert,
  Menu, X,
} from 'lucide-react';
import { useLang } from '@/lib/lang';
import { landingCopy, type LandingCopy } from './copy';
import { deepMerge } from '@/lib/theme';

// Нээлттэй эх (Open Source) кодын GitHub репозитор.
const GITHUB_URL = 'https://github.com/gerege-systems/template-dgov-mn';

// GitHub-ийн лого (lucide-react нь brand icon-уудыг гаргадаггүй тул inline SVG).
const GitHubMark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>
);

// «Бүх боломж» хэсгийн жижиг картуудын icon-ууд (copy.ts-ийн items дараалалтай нэг эрэмбэ).
const EVERYTHING_ICONS = [Fingerprint, Globe, KeyRound, ScrollText, CheckCircle2, Languages, Gauge, ShieldAlert];

interface Props {
  /** LoginForm-д дамжуулах — нэвтэрсний дараа буцах зам. */
  next: string;
  notice?: string;
  googleLink?: boolean;
  googleError?: boolean;
  /** Идэвхтэй theme-ийн landing текст/цэс (mn/en) — copy.ts default дээр давхарлана. */
  themeLanding?: { mn?: Partial<LandingCopy>; en?: Partial<LandingCopy> };
}

/**
 * Government Template Platform V3.0 — «Цахим засаглалыг бүтээх суурь» нүүр
 * (landing). Нэвтрээгүй зочдод харагдах маркетингийн нүүр. Платформын бүх
 * чадварыг харуулж, hero-ийн баруун талд Government SSO (sso.dgov.mn)-оор
 * нэвтрэх картыг шигтгэв. Нэвтрэх товч дарахад sso.dgov.mn руу шилжиж, тэндээ
 * нэвтэрч, буцаж ирнэ (OIDC RP урсгал). Брэнд токен (blue + gold) дээр найруулав.
 */
export default function LandingPage({ next, themeLanding }: Props) {
  const { lang, setLang } = useLang();
  // Mobile (<900px)-д хэсгүүдийн цэс inline харагдахгүй тул hamburger-ээр нээгдэх
  // dropdown цэс.
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Идэвхтэй theme-ийн текст байвал copy.ts default дээр гүн merge хийнэ.
  const override = themeLanding?.[lang];
  const t = override ? deepMerge(landingCopy[lang], override) : landingCopy[lang];
  const brand = t.brand || 'Government Template Platform V3.0';
  // Government SSO (sso.dgov.mn) руу нэвтрэлт эхлүүлэх — backend /sso/start руу
  // прокси хийж, browser-ийг sso.dgov.mn-ий authorize URL руу шилжүүлнэ.
  const ssoHref = `/api/auth/sso/start${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div className="lp">
      {/* ---------- Nav ---------- */}
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <a className="lp-nav__brand" href="#top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="lp-nav__mark" src="/brand.webp" alt="" aria-hidden="true" />
            <span className="lp-nav__name">{brand}</span>
          </a>

          <nav className="lp-nav__links" aria-label="Хэсгүүд">
            <a href="#features">{t.nav.features}</a>
            <a href="#security">{t.nav.security}</a>
            <a href="#tech">{t.nav.tech}</a>
            <a href="/docs/">{t.nav.docs}</a>
          </nav>

          <div className="lp-nav__actions">
            <button
              type="button"
              className="lp-lang"
              onClick={() => setLang(lang === 'mn' ? 'en' : 'mn')}
              aria-label="Хэл солих"
            >
              <Languages size={15} strokeWidth={2} />
              <span>{lang === 'mn' ? 'EN' : 'МН'}</span>
            </button>
            <a className="lp-btn lp-btn--gold lp-btn--sm" href={ssoHref}>
              <LogIn size={16} strokeWidth={2} />
              <span>{t.nav.login}</span>
            </a>
            <button
              type="button"
              className="lp-nav__burger"
              aria-label={lang === 'en' ? 'Menu' : 'Цэс'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="lp-nav__mobile" aria-label="Хэсгүүд">
            <a href="#features" onClick={() => setMenuOpen(false)}>{t.nav.features}</a>
            <a href="#security" onClick={() => setMenuOpen(false)}>{t.nav.security}</a>
            <a href="#tech" onClick={() => setMenuOpen(false)}>{t.nav.tech}</a>
            <a href="/docs/" onClick={() => setMenuOpen(false)}>{t.nav.docs}</a>
          </nav>
        )}
      </header>

      <main id="top">
        {/* ---------- Hero (зүүн: текст · full-bleed чимэглэл) ---------- */}
        <section className="lp-hero">
          <div className="lp-hero__art" aria-hidden="true" />
          <div className="lp-hero__pattern" aria-hidden="true" />
          <div className="lp-hero__inner">
            <div className="lp-hero__copy">
              <span className="lp-eyebrow">
                <span className="lp-eyebrow__dot" />
                {t.hero.badge}
              </span>
              <h1 className="lp-hero__title">
                {t.hero.titleLead}{' '}
                <span className="lp-accent">{t.hero.titleAccent}</span>{' '}
                {t.hero.titleTail}
              </h1>
              <p className="lp-hero__lede">{t.hero.lede}</p>

              <div className="lp-hero__cta">
                <a className="lp-btn lp-btn--gold lp-btn--lg" href={ssoHref}>
                  {t.hero.ctaLogin}
                  <ArrowRight size={18} strokeWidth={2} />
                </a>
                <a className="lp-btn lp-btn--outline lp-btn--lg" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GitHubMark size={18} />
                  {t.hero.ctaExplore}
                </a>
              </div>

              <div className="lp-hero__statrow">
                {t.hero.stats.map((s) => (
                  <div className="lp-stat" key={s.label}>
                    <span className="lp-stat__value">{s.value}</span>
                    <span className="lp-stat__label">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Гол давуу талууд (bento) ---------- */}
        <section className="lp-section" id="features">
          <div className="lp-container">
            <header className="lp-head">
              <h2>{t.advantages.heading}</h2>
              <p>{t.advantages.sub}</p>
            </header>

            <div className="lp-bento">
              {/* eID (wide) */}
              <article className="lp-card lp-card--wide">
                <div className="lp-card__top">
                  <span className="lp-card__icon"><Fingerprint size={26} strokeWidth={1.75} /></span>
                  <span className="lp-card__tag">{t.advantages.eidTag}</span>
                </div>
                <div>
                  <h3>{t.advantages.eidTitle}</h3>
                  <p>{t.advantages.eidBody}</p>
                </div>
              </article>

              {/* Google холболт (dark) */}
              <article className="lp-card lp-card--dark">
                <span className="lp-card__icon lp-card__icon--onDark"><KeyRound size={26} strokeWidth={1.75} /></span>
                <div>
                  <h3>{t.advantages.googleTitle}</h3>
                  <p>{t.advantages.googleBody}</p>
                </div>
              </article>

              {/* Аюулгүй байдал (muted) */}
              <article className="lp-card lp-card--muted" id="security">
                <span className="lp-card__icon"><ShieldCheck size={26} strokeWidth={1.75} /></span>
                <div>
                  <h3>{t.advantages.secTitle}</h3>
                  <p>{t.advantages.secBody}</p>
                </div>
              </article>

              {/* SSO / OIDC provider (wide split) */}
              <article className="lp-card lp-card--wide lp-card--split">
                <div>
                  <span className="lp-card__icon"><Network size={26} strokeWidth={1.75} /></span>
                  <h3>{t.advantages.ssoTitle}</h3>
                  <p>{t.advantages.ssoBody}</p>
                </div>
                <span className="lp-card__ghost" aria-hidden="true"><Network size={120} strokeWidth={1} /></span>
              </article>

              {/* Sign-relay (wide split) */}
              <article className="lp-card lp-card--wide lp-card--split">
                <div>
                  <span className="lp-card__icon"><ScrollText size={26} strokeWidth={1.75} /></span>
                  <h3>{t.advantages.signTitle}</h3>
                  <p>{t.advantages.signBody}</p>
                </div>
                <span className="lp-card__ghost" aria-hidden="true"><Waypoints size={120} strokeWidth={1} /></span>
              </article>

              {/* Зөвшөөрөл санах */}
              <article className="lp-card">
                <span className="lp-card__icon"><Users size={26} strokeWidth={1.75} /></span>
                <div>
                  <h3>{t.advantages.consentTitle}</h3>
                  <p>{t.advantages.consentBody}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------- Технологи split ---------- */}
        <section className="lp-section lp-section--alt" id="tech">
          <div className="lp-container lp-split">
            <div className="lp-split__copy">
              <h2>{t.tech.heading}</h2>
              <p className="lp-split__sub">{t.tech.sub}</p>
              <ul className="lp-feature-list">
                <li>
                  <span className="lp-feature-list__icon"><Terminal size={20} strokeWidth={1.9} /></span>
                  <div>
                    <h4>{t.tech.backendTitle}</h4>
                    <p>{t.tech.backendBody}</p>
                  </div>
                </li>
                <li>
                  <span className="lp-feature-list__icon"><Layers size={20} strokeWidth={1.9} /></span>
                  <div>
                    <h4>{t.tech.frontendTitle}</h4>
                    <p>{t.tech.frontendBody}</p>
                  </div>
                </li>
                <li>
                  <span className="lp-feature-list__icon"><Bot size={20} strokeWidth={1.9} /></span>
                  <div>
                    <h4>{t.tech.aiTitle}</h4>
                    <p>{t.tech.aiBody}</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Итгэлийн баталгааны карт */}
            <div className="lp-deploy">
              <div className="lp-deploy__bar">
                <span>{t.tech.trustTitle}</span>
                <span className="lp-deploy__badge">{t.tech.trustBadge}</span>
              </div>
              <ul className="lp-deploy__list">
                {t.tech.trustItems.map((item) => (
                  <li key={item}>
                    <span className="lp-deploy__check"><CheckCircle2 size={18} strokeWidth={2} /></span>
                    <span className="lp-deploy__label">{item}</span>
                    <span className="lp-deploy__state">Active</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- Бүх боломж ---------- */}
        <section className="lp-section">
          <div className="lp-container">
            <header className="lp-head">
              <h2>{t.everything.heading}</h2>
              <p>{t.everything.sub}</p>
            </header>
            <div className="lp-grid">
              {t.everything.items.map((it, i) => {
                const Icon = EVERYTHING_ICONS[i] ?? Sparkles;
                return (
                  <article className="lp-mini" key={it.title}>
                    <span className="lp-mini__icon"><Icon size={20} strokeWidth={1.9} /></span>
                    <h4>{it.title}</h4>
                    <p>{it.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- Эцсийн CTA ---------- */}
        <section className="lp-cta">
          <div className="lp-cta__pattern" aria-hidden="true" />
          <div className="lp-container lp-cta__inner">
            <h2>{t.cta.title}</h2>
            <p>{t.cta.sub}</p>
            <div className="lp-cta__buttons">
              <a className="lp-btn lp-btn--gold lp-btn--lg" href={ssoHref}>
                {t.cta.ctaLogin}
                <ArrowRight size={18} strokeWidth={2} />
              </a>
              <a className="lp-btn lp-btn--glass lp-btn--lg" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubMark size={18} />
                {t.cta.ctaExplore}
              </a>
            </div>
            <p className="lp-cta__tagline">{t.cta.tagline}</p>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <div className="lp-footer__brand">
            <div className="lp-footer__mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand.webp" alt="" aria-hidden="true" />
              <span>{brand}</span>
            </div>
            <p>{t.footer.tagline}</p>
          </div>
          <nav className="lp-footer__links" aria-label="Footer">
            {t.footer.links.map((l) => (
              <a href="#top" key={l}>{l}</a>
            ))}
          </nav>
          <p className="lp-footer__copy">{t.footer.copyright}</p>
        </div>
      </footer>
    </div>
  );
}
