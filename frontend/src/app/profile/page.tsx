import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// /profile → /me/profile рүү шилжсэн (хуучин bookmark-уудыг хадгална).
export default function ProfileRedirect() {
  redirect('/me/profile');
}
