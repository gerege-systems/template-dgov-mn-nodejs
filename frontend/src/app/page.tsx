// Government Template Platform V3.0
// Gerege Systems Development Team & Claude AI, 2026
import React from 'react';
import { redirect } from 'next/navigation';
import { hasSession } from '@/lib/session';
import { safeNext } from '@/lib/navigation';
import { fetchActiveTheme } from '@/lib/api';
import LandingPage from '@/components/landing/LandingPage';

export const dynamic = 'force-dynamic';

// sso.dgov.mn нь энэ платформын жишээ deployment. Нүүр хуудас нь Government
// Template Platform V3.0-ийн («Цахим засаглалыг бүтээх суурь») чадваруудыг
// харуулсан landing бөгөөд нэвтрэх картыг (LoginForm) hero дотроо шигтгэсэн.
// Нэвтэрсэн хэрэглэгчийг /me домэйн руу шилжүүлнэ.
export default async function Home(props: {
  searchParams: Promise<{ next?: string; notice?: string; glink?: string; gerror?: string }>;
}) {
  if (await hasSession()) redirect('/me/dashboard');

  const searchParams = await props.searchParams;
  // Энэ хуудас өөрөө нэвтрэх картыг агуулна (route '/') тул нэвтэрсний дараа '/'
  // рүү түлхэх нь ижил зам дээр no-op болж гацдаг. Тиймээс тодорхой next байхгүй
  // бол нэвтэрсэн хэрэглэгчийн нүүр рүү (/me/dashboard).
  const safe = safeNext(searchParams.next);
  const next = safe === '/' ? '/me/dashboard' : safe;

  // Идэвхтэй theme-ийн landing текст/цэс — LandingPage copy.ts default дээр merge хийнэ.
  const theme = await fetchActiveTheme();

  return (
    <LandingPage
      next={next}
      notice={searchParams.notice}
      googleLink={searchParams.glink === '1'}
      googleError={!!searchParams.gerror}
      themeLanding={theme.landing}
    />
  );
}
