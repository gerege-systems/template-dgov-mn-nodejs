"use client";

import React from 'react';
import { KeyRound, LogOut, Palette } from 'lucide-react';
import { useT } from '@/lib/lang';
import ChangePasswordForm from '@/app/settings/ChangePasswordForm';
import SignOutButton from '@/components/SignOutButton';
import AppearanceControls from '@/components/AppearanceControls';

export default function SettingsView() {
  const { T } = useT();
  return (
    <>
      <div className="page-head">
        <span className="page-head__eyebrow">{T('me.security.eyebrow')}</span>
        <h1>{T('me.security.title')}</h1>
        <p className="page-head__sub">{T('me.security.sub')}</p>
      </div>

      <section className="card" aria-label={T('appearance.title')}>
        <div className="card__head card__head--with-sub">
          <div className="card__title">
            <Palette size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('appearance.title')}</h2>
          </div>
          <span className="card__sub">{T('appearance.sub')}</span>
        </div>
        <AppearanceControls />
      </section>

      <section className="card" aria-label={T('me.pw.title')}>
        <div className="card__head card__head--with-sub">
          <div className="card__title">
            <KeyRound size={18} strokeWidth={2} style={{ color: 'var(--dan-blue-text)' }} />
            <h2>{T('me.pw.title')}</h2>
          </div>
          <span className="card__sub">{T('me.pw.sub')}</span>
        </div>
        <ChangePasswordForm />
      </section>

      <section className="card" aria-label={T('me.session.title')}>
        <div className="card__head card__head--with-sub">
          <div className="card__title">
            <LogOut size={18} strokeWidth={2} style={{ color: 'var(--danger)' }} />
            <h2>{T('me.session.title')}</h2>
          </div>
          <span className="card__sub">{T('me.session.sub')}</span>
        </div>
        <SignOutButton />
      </section>
    </>
  );
}
