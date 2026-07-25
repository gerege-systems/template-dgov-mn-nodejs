"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getJSON } from '@/lib/client';
import {
  LayoutDashboard, User, ShieldCheck, HelpCircle, LogOut, Menu, Search, ChevronDown,
  Users, ShieldHalf, Briefcase, Bot, Languages, Building2,
  ScrollText, ShieldAlert, KeyRound,
  Plug,
  Gauge, Server, Crown, Palette,
  Landmark, Inbox, FileCheck, CalendarClock, Wallet, Bell,
  CreditCard, Smartphone, FileSignature, BookOpen, ClipboardCheck, Library, Database,
} from 'lucide-react';
import UserMenu from './UserMenu';
import NavSearch, { type SearchItem } from './NavSearch';
import { signOut } from '@/lib/signout';
import { useT } from '@/lib/lang';
import type { DictKey } from '@/lib/i18n';
import { displayName, isAdminLevel, isSuperAdmin } from '@/lib/types';
import { initialsOf } from '@/lib/format';

export interface AppUser {
  username: string;
  fullName: string;
  fullNameEn: string;
  email: string;
  initials: string;
  picture?: string; // Google профайл зураг (холбогдсон бол)
  roleId: number;
}

interface Props {
  user: AppUser;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  labelKey: DictKey;
  icon: typeof User;
  perm?: string; // шаардагдах эрх; байхгүй бол бүх нэвтэрсэн хэрэглэгчид
  superAdminOnly?: boolean; // зөвхөн super admin (perm bypass-д хамаарахгүй)
}
// Дэд систем (subsystem) = систем доторх нэрлэсэн бүлэг — зүүн цэсийн ДУНД түвшин.
// Систем бүр ДОР ХАЯЖ 1 дэд системтэй тул labelKey ЗААВАЛ (нэргүй бүлэг байхгүй).
interface NavSubsystem {
  labelKey: DictKey;
  items: NavItem[];
}
// Систем = icon rail дахь дээд түвшин (Супер админ / Админ / Менежер / Иргэн).
// adminOnly бол зөвхөн admin харна; superAdminOnly бол зөвхөн super admin харна.
// Гурван түвшин: Систем → Дэд систем → Цэс.
interface NavSystem {
  key: string;
  labelKey: DictKey;
  brand: string; // sidepanel-ийн дээд мөр — идэвхтэй систем бүрээр солигдоно (English)
  icon: typeof User;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  subsystems: NavSubsystem[]; // дор хаяж 1
}

// BPMN, translator, AI зэрэг хэсгүүдийг хассан — зөвхөн generic admin цөм.
const SYSTEMS: NavSystem[] = [
  {
    // Super Admin — админ системээс ТУСДАА, дээд түвшний систем (зөвхөн super admin
    // харна). Rail-д admin-ы дээр эхэнд байрлана.
    key: 'superadmin',
    labelKey: 'sys.superadmin',
    brand: 'Super Admin System',
    icon: Crown,
    superAdminOnly: true,
    subsystems: [
      {
        labelKey: 'group.superadmin',
        items: [
          { href: '/admin/superadmin', labelKey: 'nav.superadminAdmins', icon: Crown, superAdminOnly: true },
          { href: '/admin/themes', labelKey: 'themes.title', icon: Palette, superAdminOnly: true },
        ],
      },
    ],
  },
  {
    key: 'admin',
    labelKey: 'sys.admin',
    brand: 'Admin System',
    icon: ShieldHalf,
    adminOnly: true,
    subsystems: [
      {
        labelKey: 'group.general',
        items: [
          { href: '/admin/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
        ],
      },
      {
        labelKey: 'group.management',
        items: [
          { href: '/admin/users', labelKey: 'nav.users', icon: Users, perm: 'users.manage' },
          { href: '/admin/core', labelKey: 'nav.coreSearch', icon: Search, perm: 'users.manage' },
          { href: '/admin/roles', labelKey: 'nav.roles', icon: ShieldHalf, perm: 'roles.manage' },
          { href: '/admin/settings', labelKey: 'nav.settings', icon: ShieldCheck, perm: 'settings.manage' },
        ],
      },
      {
        labelKey: 'group.gateway',
        items: [
          { href: '/admin/gateway/overview', labelKey: 'nav.gwOverview', icon: Gauge, perm: 'gateway.manage' },
          { href: '/admin/gateway/services', labelKey: 'nav.gwServices', icon: Server, perm: 'gateway.manage' },
          { href: '/admin/applications', labelKey: 'nav.applications', icon: KeyRound, perm: 'gateway.manage' },
          { href: '/admin/gateway/logs', labelKey: 'nav.gwLogs', icon: ScrollText, perm: 'gateway.manage' },
        ],
      },
      {
        labelKey: 'group.relay',
        items: [
          { href: '/admin/relay', labelKey: 'nav.relayDashboard', icon: Gauge, perm: 'relay.view' },
          { href: '/admin/relay/config', labelKey: 'nav.relayConfig', icon: Building2, perm: 'relay.manage' },
        ],
      },
      {
        // Үйлчилгээний нэгдсэн регистр (CPSV-AP паспорт + нотолгооны каталог).
        labelKey: 'group.registry',
        items: [
          { href: '/admin/registry', labelKey: 'nav.registryOverview', icon: Gauge, perm: 'registry.view' },
          { href: '/admin/registry/services', labelKey: 'nav.registryServices', icon: Library, perm: 'registry.view' },
          { href: '/admin/registry/evidences', labelKey: 'nav.registryEvidences', icon: Database, perm: 'registry.view' },
        ],
      },
      {
        labelKey: 'group.security',
        items: [
          { href: '/admin/audit', labelKey: 'nav.audit', icon: ScrollText },
          { href: '/admin/security', labelKey: 'nav.security', icon: ShieldAlert },
        ],
      },
    ],
  },
  {
    key: 'manager',
    labelKey: 'sys.manager',
    brand: 'Manager System',
    icon: Briefcase,
    subsystems: [
      {
        labelKey: 'group.manager',
        items: [
          { href: '/manager/dashboard', labelKey: 'nav.managerDashboard', icon: LayoutDashboard, perm: 'manager.view' },
          { href: '/manager/requests', labelKey: 'nav.govQueue', icon: ClipboardCheck, perm: 'gov.review' },
          { href: '/manager/users', labelKey: 'nav.users', icon: Users, perm: 'users.manage' },
        ],
      },
    ],
  },
  {
    // Иргэнд харагдах гол систем — ТӨРИЙН ҮЙЛЧИЛГЭЭ + eID. eID бүлэг нь SSO-ийн
    // eID proxy service-үүдтэй холбогдож ажиллана (backend EID_* тохиргоо).
    key: 'me',
    labelKey: 'sys.gov',
    brand: 'Government Services',
    icon: Landmark,
    subsystems: [
      {
        labelKey: 'group.govServices',
        items: [
          { href: '/me/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
          { href: '/me/services', labelKey: 'nav.govServices', icon: Landmark },
          { href: '/me/applications', labelKey: 'nav.govApplications', icon: Inbox },
          { href: '/me/references', labelKey: 'nav.govReferences', icon: FileCheck },
          { href: '/me/appointments', labelKey: 'nav.govAppointments', icon: CalendarClock },
          { href: '/me/payments', labelKey: 'nav.govPayments', icon: Wallet },
          { href: '/me/notifications', labelKey: 'nav.govNotifications', icon: Bell },
        ],
      },
      {
        labelKey: 'group.eid',
        items: [
          { href: '/me/eid/id', labelKey: 'nav.eidId', icon: CreditCard },
          { href: '/me/eid/certificates', labelKey: 'nav.eidCerts', icon: KeyRound },
          { href: '/me/eid/devices', labelKey: 'nav.eidDevices', icon: Smartphone },
          { href: '/me/eid/logs', labelKey: 'nav.eidLogs', icon: ScrollText },
          { href: '/me/eid/security', labelKey: 'nav.eidSecurity', icon: ShieldCheck },
        ],
      },
      {
        labelKey: 'group.personal',
        // Профайл, Тохиргоо нь баруун дээд dropdown-д байгаа тул зүүн цэсэнд давхардуулахгүй.
        items: [
          { href: '/me/organizations', labelKey: 'nav.org', icon: Building2 },
          { href: '/me/eid/sign', labelKey: 'nav.eidSign', icon: FileSignature },
          { href: '/me/integrations', labelKey: 'nav.integrations', icon: Plug },
          { href: '/me/ai', labelKey: 'nav.ai', icon: Bot },
          { href: '/me/translate', labelKey: 'nav.translate', icon: Languages },
        ],
      },
    ],
  },
];

/**
 * Хоёр түвшний бүрхүүл — icon rail дахь "систем" (Админ / Менежер / Хэрэглэгч)
 * тус бүр өөрийн дэд цэстэй. Хэрэглэгчийн эрхээр (/api/rbac/me) цэсийг шүүж,
 * хэлийг useT()-ээр (mn/en) орчуулна.
 */
export default function AppShell({ user, children }: Props) {
  const pathname = usePathname() ?? '/';
  const { T, lang } = useT();
  const isAdmin = isAdminLevel(user.roleId); // super admin + admin
  const isSuper = isSuperAdmin(user.roleId);

  // TanStack Query — олон component зэрэг mount хийгдсэн ч /api/rbac/me-г
  // нэг л удаа татна (deduplication + кэш).
  const permsQuery = useQuery({
    queryKey: ['rbac-me'],
    queryFn: () => getJSON<string[]>('/api/rbac/me'),
  });
  const perms = permsQuery.isPending ? null : (permsQuery.data ?? []);

  // superAdminOnly item нь perm bypass-д хамаарахгүй — зөвхөн super admin харна
  // (энгийн admin ч харахгүй).
  const canSeeItem = (i: NavItem) => {
    if (i.superAdminOnly) return isSuper;
    return !i.perm || isAdmin || (perms?.includes(i.perm) ?? false);
  };
  const visibleSubsystems = (s: NavSystem) =>
    s.subsystems
      .map((g) => ({ ...g, items: g.items.filter(canSeeItem) }))
      .filter((g) => g.items.length > 0);
  const systems = SYSTEMS.filter((s) => {
    if (s.superAdminOnly && !isSuper) return false;
    // Super admin нэвтэрсэн бол ЗӨВХӨН Super Admin системийг харуулна — бусад бүх
    // системийг (Admin/Manager/Хэрэглэгч) нууна. (Профайл/гарах нь баруун дээд
    // UserMenu-д хэвээр байна.)
    if (isSuper && !s.superAdminOnly) return false;
    if (s.adminOnly && !isAdmin) return false;
    return visibleSubsystems(s).length > 0;
  });

  // Дээд талын хайлтын каталог — харагдах бүх цэсний зүйл (эрхийн дагуу) +
  // dropdown-д байдаг Профайл/Тохиргоо. Бичихэд шүүж, сонгоход шилжинэ.
  const searchItems: SearchItem[] = [
    ...systems.flatMap((s) =>
      visibleSubsystems(s).flatMap((g) => g.items.map((i) => ({ label: T(i.labelKey), href: i.href, group: T(s.labelKey) }))),
    ),
    { label: T('nav.profile'), href: '/me/profile', group: T('sys.user') },
    { label: T('nav.settings'), href: '/me/settings', group: T('sys.user') },
  ];

  // Идэвхтэй цэсийг ХАМГИЙН УРТ таарсан замаар нь сонгоно.
  //
  // Энгийн startsWith нь үүрлэсэн замуудад ХОЁУЛАНГ нь идэвхжүүлдэг:
  // /admin/relay/routes дээр байхад '/admin/relay' (Хяналтын самбар) ба
  // '/admin/relay/routes' (Чиглүүлэлт) хоёулаа таарч, хоёр цэс зэрэг
  // сонгогдсон харагдана. Тиймээс бүх цэснээс таарсан хамгийн уртыг нь олж,
  // зөвхөн түүнийг идэвхтэй гэж үзнэ.
  //
  // Мөн зөвхөн сегментийн зааг дээр таарна ('/admin/relay' нь
  // '/admin/relayfoo'-г таарууллаа гэж үзэхгүй).
  const matches = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const bestHref = systems
    .flatMap((s) => visibleSubsystems(s).flatMap((g) => g.items.map((i) => i.href)))
    .filter(matches)
    .reduce((best, href) => (href.length > best.length ? href : best), '');

  const isActive = (href: string) => (bestHref !== '' ? href === bestHref : matches(href));
  // Нүүр '/' нь "me" системд багтдаг ч default панелийг түүгээр сонгохгүй —
  // ингэснээр admin/manager нэвтрэхдээ нүүрэн дээр өөрийн дээд системээ нээлттэй
  // хардаг; гүн холбоос (/admin/*, /manager/*) хэвээр зөв.
  const systemMatches = (s: NavSystem) =>
    visibleSubsystems(s).some((g) => g.items.some((i) => i.href !== '/' && isActive(i.href)));

  const activeSystem = systems.find(systemMatches) ?? systems[0];
  const [openKey, setOpenKey] = useState(activeSystem?.key ?? '');
  const [collapsed, setCollapsed] = useState(false);
  // Accordion — зөвхөн НЭГ дэд систем нээлттэй байна (labelKey). Дараах sync
  // effect нь навигаци/систем солиход идэвхтэй хуудсын дэд системийг нээнэ.
  const [openSub, setOpenSub] = useState<string>('');

  const panel = systems.find((s) => s.key === openKey) ?? activeSystem;
  const panelSubs = panel ? visibleSubsystems(panel) : [];
  // Идэвхтэй хуудсыг агуулсан дэд систем (эс бол эхнийх) — default нээлттэй.
  const activeSubKey =
    panelSubs.find((g) => g.items.some((i) => isActive(i.href)))?.labelKey ??
    panelSubs[0]?.labelKey ??
    '';

  useEffect(() => {
    if (activeSystem) setOpenKey(activeSystem.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSystem?.key]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setCollapsed(true);
  }, []);

  // Навигаци/систем солиход идэвхтэй хуудсын дэд системийг автоматаар нээнэ.
  useEffect(() => { setOpenSub(activeSubKey); }, [activeSubKey]);

  // Mobile (≤900px)-д sidepanel нь зүүн талын drawer — навигаци эсвэл backdrop
  // дээр дарахад хаагдана. Desktop-д (grid) энэ нөлөөлөхгүй.
  const closeMobileNav = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 900) setCollapsed(true);
  };

  // Доод tab bar-аас систем рүү шилжих хаяг — тухайн системийн эрхээр шүүгдсэн
  // ЭХНИЙ хуудас (visibleSubsystems нь хоосон бүлгийг аль хэдийн хассан).
  const firstHref = (s: NavSystem) => visibleSubsystems(s)[0]?.items[0]?.href ?? '/';

  if (!activeSystem || !panel) {
    return (
      <div className="shell2 shell2--loading" aria-busy="true">
        <aside className="iconrail" />
        <main className="maincol" />
      </div>
    );
  }

  return (
    <div className={`shell2${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="iconrail">
        <Link href="/" className="iconrail__brand" aria-label="Government Template Platform V3.0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand.webp" alt="Government Template Platform V3.0" />
        </Link>
        <nav className="iconrail__nav" aria-label={T('shell.menu')}>
          {systems.map((s) => {
            const Icon = s.icon;
            const active = s.key === activeSystem.key;
            return (
              <button
                key={s.key}
                type="button"
                className={`iconrail__btn${active ? ' is-active' : ''}`}
                title={T(s.labelKey)}
                aria-label={T(s.labelKey)}
                onClick={() => {
                  setOpenKey(s.key);
                  setCollapsed(false);
                }}
              >
                <Icon size={20} strokeWidth={2} />
              </button>
            );
          })}
        </nav>
        <div className="iconrail__bottom">
          <a className="iconrail__btn" href="/docs/" target="_blank" rel="noreferrer" title={T('nav.docs')} aria-label={T('nav.docs')}>
            <BookOpen size={20} strokeWidth={2} />
          </a>
          <a className="iconrail__btn" href="https://dgov.mn/help" target="_blank" rel="noreferrer" title={T('nav.help')} aria-label={T('nav.help')}>
            <HelpCircle size={20} strokeWidth={2} />
          </a>
          <button className="iconrail__btn iconrail__signout" type="button" title={T('nav.signout')} aria-label={T('nav.signout')} onClick={() => signOut()}>
            <LogOut size={20} strokeWidth={2} />
          </button>
        </div>
      </aside>

      <aside className="sidepanel">
        <div className="sidepanel__head">
          <span className="sidepanel__brand-name">{panel.brand}</span>
          <span className="sidepanel__title">{T(panel.labelKey)}</span>
        </div>
        <nav className="sidepanel__nav">
          {panelSubs.map((g) => {
            const open = openSub === g.labelKey;
            return (
            <div key={g.labelKey} className={`sidepanel__group${open ? ' is-open' : ''}`}>
              {/* Дэд системийн толгой — дарахад энэ нээгдэж, бусад нь хаагдана. */}
              <button
                type="button"
                className="sidepanel__group-head"
                aria-expanded={open}
                onClick={() => setOpenSub(open ? '' : g.labelKey)}
              >
                <span className="sidepanel__group-label">{T(g.labelKey)}</span>
                <ChevronDown size={15} strokeWidth={2.5} className="sidepanel__chev" />
              </button>
              {open && <div className="sidepanel__group-items">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidepanel__link${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={closeMobileNav}
                  >
                    <Icon size={16} strokeWidth={2} />
                    <span>{T(item.labelKey)}</span>
                  </Link>
                );
              })}
              </div>}
            </div>
            );
          })}
        </nav>
      </aside>

      <div className="maincol">
        <header className="topbar2">
          <button className="topbar2__toggle" type="button" aria-label={T('shell.menu')} onClick={() => setCollapsed((c) => !c)}>
            <Menu size={20} strokeWidth={2} />
          </button>
          <div className="topbar2__spacer" />
          <NavSearch items={searchItems} placeholder={T('shell.search')} emptyText={lang === 'en' ? 'No results' : 'Илэрц алга'} />
          <div className="topbar2__actions">
            <a className="topbar2__docs" href="/docs/" target="_blank" rel="noreferrer" title={T('nav.docs')} aria-label={T('nav.docs')}>
              <BookOpen size={16} strokeWidth={2} />
              <span>{T('nav.docs')}</span>
            </a>
            <UserMenu username={displayName(user, lang)} email={user.email} initials={initialsOf(displayName(user, lang))} picture={user.picture} />
          </div>
        </header>

        <main className="main">
          <div className="main__inner">{children}</div>
        </main>
      </div>

      {/* Mobile drawer/bottom-sheet backdrop — нээлттэй үед контентыг бүрхэж, дарахад хаана. */}
      <button
        type="button"
        className="shell2__backdrop"
        aria-label={T('shell.menu')}
        tabIndex={-1}
        onClick={() => setCollapsed(true)}
      />

      {/* Mobile bottom tab bar — iconrail-ийг орлож ЗӨВХӨН системүүдийг харуулна.
          Товшиход тухайн системийн эхний хуудас руу шилжинэ; хуудсуудын жагсаалт
          нь зүүн дээд буланд байрлах ☰ (topbar2__toggle) drawer-т байна. */}
      <nav className="bottombar" aria-label={T('shell.menu')}>
        {systems.map((s) => {
          const Icon = s.icon;
          const active = s.key === activeSystem.key;
          return (
            <Link
              key={s.key}
              href={firstHref(s)}
              className={`bottombar__tab${active ? ' is-active' : ''}`}
              aria-label={T(s.labelKey)}
              aria-current={active ? 'page' : undefined}
              onClick={() => { setOpenKey(s.key); setCollapsed(true); }}
            >
              <Icon size={20} strokeWidth={2} />
              <span>{T(s.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
