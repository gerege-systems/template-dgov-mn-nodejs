import { Navigate } from 'react-router-dom';


// /profile → /me/profile рүү шилжсэн (хуучин bookmark-уудыг хадгална).
export default function ProfileRedirect() {
  return <Navigate to='/me/profile' replace />;
}
