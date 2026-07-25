// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';

import LandingPage from '@/components/landing/LandingPage';
import { getJSON } from '@/lib/client';
import { safeNext } from '@/lib/navigation';
import { useSession } from '@/lib/session';
import { EMPTY_THEME_CONFIG, type ThemeConfig } from '@/lib/theme';

/** fetchActiveTheme нь идэвхтэй landing загварыг уншина (нээлттэй endpoint). */
async function fetchActiveTheme(): Promise<ThemeConfig> {
  try {
    const res = await getJSON<{ config?: ThemeConfig }>('/themes/active');
    return { ...EMPTY_THEME_CONFIG, ...(res.config ?? {}) };
  } catch {
    // Загвар уншигдахгүй бол өгөгдмөлөөр — нүүр хуудас ХЭЗЭЭ Ч цагаан болохгүй.
    return EMPTY_THEME_CONFIG;
  }
}

/**
 * Нүүр хуудас нь платформын чадваруудыг харуулсан landing бөгөөд нэвтрэх
 * картыг hero дотроо шигтгэсэн. Нэвтэрсэн хэрэглэгчийг /me рүү шилжүүлнэ.
 */
export default function Home(): React.ReactElement | null {
  const { me, loading } = useSession();
  const [searchParams] = useSearchParams();
  const theme = useQuery({ queryKey: ['theme', 'active'], queryFn: fetchActiveTheme });

  if (loading) return null;
  if (me) return <Navigate to="/me/dashboard" replace />;

  // Энэ хуудас өөрөө нэвтрэх картыг агуулна тул нэвтэрсний дараа '/' рүү
  // түлхэх нь ижил зам дээр no-op болж гацна — өгөгдмөл нь /me/dashboard.
  const safe = safeNext(searchParams.get('next') ?? undefined);
  const next = safe === '/' ? '/me/dashboard' : safe;

  return (
    <LandingPage
      next={next}
      notice={searchParams.get('notice') ?? undefined}
      googleLink={searchParams.get('glink') === '1'}
      googleError={searchParams.get('gerror') !== null}
      themeLanding={(theme.data ?? EMPTY_THEME_CONFIG).landing}
    />
  );
}
