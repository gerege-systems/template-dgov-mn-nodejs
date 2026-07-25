"use client";

import React from 'react';
import Link from 'next/link';
import { useT } from '@/lib/lang';

export default function SettingsNote() {
  const { T } = useT();
  return (
    <div className="card" style={{ padding: 22 }}>
      <p className="muted" style={{ marginTop: 0 }}>{T('settings.ownNote')}</p>
      <Link className="btn btn--secondary btn--sm" href="/settings">{T('nav.security')}</Link>
    </div>
  );
}
