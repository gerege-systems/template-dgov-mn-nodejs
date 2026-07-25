import { postJSON } from './client';

// Гарах: BFF-ийн logout route-г дуудаж (refresh токенг backend-ийн blacklist руу
// илгээж, cookie-г цэвэрлэнэ), дараа нь шилжинэ. SSO-ээр нэвтэрсэн бол хариунд
// sso_logout_url ирнэ — тийш чиглүүлж SSO (Hydra) дээрх session-ийг мөн дуусгана
// (тэндээс post_logout_redirect_uri-аар нүүр рүү буцна). Эс бөгөөс нүүр (/) рүү —
// нүүр нь нэвтрэх картыг агуулсан landing тул дахин нэвтрэхэд бэлэн.
// Сүлжээ амжилтгүй ч client талаас шилжүүлж, дахин нэвтрэхийг шаардана.
export async function signOut(): Promise<void> {
  let ssoLogoutURL: string | undefined;
  try {
    const r = await postJSON<{ sso_logout_url?: string }>('/api/auth/logout', undefined);
    ssoLogoutURL = r.data?.sso_logout_url;
  } catch {
    /* алдаа гарсан ч доор шилжүүлнэ */
  } finally {
    window.location.href = ssoLogoutURL || '/';
  }
}
