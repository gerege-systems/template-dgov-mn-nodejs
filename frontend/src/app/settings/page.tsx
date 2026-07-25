import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// /settings → /me/settings рүү шилжсэн (хуучин bookmark-уудыг хадгална).
export default function SettingsRedirect() {
  redirect('/me/settings');
}
