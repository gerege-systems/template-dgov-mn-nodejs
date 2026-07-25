"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, User, Settings, Globe, Moon, Sun, Monitor, HelpCircle, LogOut } from 'lucide-react';
import SegmentedControl from './SegmentedControl';
import { usePreferences, showToast } from '@/lib/preferences';
import { useLang } from '@/lib/lang';
import { signOut } from '@/lib/signout';

interface Props {
  username: string;
  email: string;
  initials: string;
  picture?: string; // Google профайл зураг (холбогдсон бол initials-ийн оронд)
}

export default function UserMenu({ username, email, initials, picture }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { theme, setTheme } = usePreferences();
  const { lang, setLang } = useLang();

  // Гадна дарах + Escape хаах
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    setTheme(value);
    const labelMN = value === 'dark' ? 'Харанхуй загвар идэвхтэй'
      : value === 'light' ? 'Гэгээн загвар идэвхтэй'
      : 'Системийн загвар дагаж байна';
    const labelEN = value === 'dark' ? 'Dark theme applied'
      : value === 'light' ? 'Light theme applied'
      : 'Following system theme';
    showToast(lang === 'en' ? labelEN : labelMN);
  };

  const handleLangChange = (value: 'mn' | 'en') => {
    setLang(value);
    showToast(value === 'en' ? 'Language: English (partial)' : 'Хэл солигдлоо: Монгол');
  };

  return (
    <div ref={menuRef} className={`user-menu${open ? ' is-open' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="topbar__user"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="user-menu-popover"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
        }}
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="topbar__avatar" src={picture} alt="" width={28} height={28} style={{ objectFit: 'cover', padding: 0 }} referrerPolicy="no-referrer" />
        ) : (
          <span className="topbar__avatar">{initials}</span>
        )}
        <span>{username}</span>
        <ChevronDown size={14} className="topbar__user-chevron" strokeWidth={2} />
      </button>

      {open && (
        <div id="user-menu-popover" role="menu" className="user-menu__popover">
          <div className="user-menu__header">
            <div className="user-menu__name">{username}</div>
            <div className="user-menu__sub mono">{email}</div>
          </div>

          <Link className="user-menu__item" role="menuitem" href="/me/profile" onClick={() => setOpen(false)}>
            <User size={16} strokeWidth={2} />
            <span>{lang === 'en' ? 'Profile' : 'Профайл'}</span>
          </Link>
          <Link className="user-menu__item" role="menuitem" href="/me/settings" onClick={() => setOpen(false)}>
            <Settings size={16} strokeWidth={2} />
            <span>{lang === 'en' ? 'Settings' : 'Тохиргоо'}</span>
          </Link>

          <div className="user-menu__divider" role="separator" />
          <div className="user-menu__section-label">
            {lang === 'en' ? 'Preferences' : 'Тохиргоо'}
          </div>

          <div className="user-menu__control">
            <span className="user-menu__control-label">
              <Globe size={16} strokeWidth={2} />
              <span>{lang === 'en' ? 'Language' : 'Хэл'}</span>
            </span>
            <SegmentedControl
              ariaLabel="Хэл сонгох"
              value={lang}
              onChange={handleLangChange}
              options={[
                { value: 'mn', label: 'МН' },
                { value: 'en', label: 'EN' },
              ]}
            />
          </div>

          <div className="user-menu__control">
            <span className="user-menu__control-label">
              <Moon size={16} strokeWidth={2} />
              <span>{lang === 'en' ? 'Appearance' : 'Загвар'}</span>
            </span>
            <SegmentedControl
              ariaLabel="Загвар сонгох"
              value={theme}
              onChange={handleThemeChange}
              options={[
                { value: 'light',  icon: <Sun     size={14} strokeWidth={2} />, ariaLabel: lang === 'en' ? 'Light'  : 'Гэгээн' },
                { value: 'dark',   icon: <Moon    size={14} strokeWidth={2} />, ariaLabel: lang === 'en' ? 'Dark'   : 'Харанхуй' },
                { value: 'system', icon: <Monitor size={14} strokeWidth={2} />, ariaLabel: lang === 'en' ? 'System' : 'Систем' },
              ]}
            />
          </div>

          <div className="user-menu__divider" role="separator" />

          <a className="user-menu__item" role="menuitem" href="https://dgov.mn/help" target="_blank" rel="noreferrer">
            <HelpCircle size={16} strokeWidth={2} />
            <span>{lang === 'en' ? 'Help & support' : 'Тусламж'}</span>
          </a>

          <div className="user-menu__divider" role="separator" />
          <button
            type="button"
            className="user-menu__item user-menu__item--danger"
            role="menuitem"
            onClick={() => signOut()}
          >
            <LogOut size={16} strokeWidth={2} />
            <span>{lang === 'en' ? 'Sign out' : 'Гарах'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
