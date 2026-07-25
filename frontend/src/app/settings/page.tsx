import { Navigate } from 'react-router-dom';


// /settings → /me/settings рүү шилжсэн (хуучин bookmark-уудыг хадгална).
export default function SettingsRedirect() {
  return <Navigate to='/me/settings' replace />;
}
