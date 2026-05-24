import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { canAccessView, getHomeViewForUser } from '../utils/rbac';
import { readStoredUser } from '../utils/session-user';
import { activeViewFromPathname, appPath } from './app-paths';

export function RequireAuth() {
  const location = useLocation();
  const token = localStorage.getItem('accessToken') ?? localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const user = readStoredUser();
  if (location.pathname.startsWith('/app')) {
    const view = activeViewFromPathname(location.pathname);
    if (view == null) {
      return <Navigate to={appPath(getHomeViewForUser(user))} replace />;
    }
    if (!canAccessView(user, view)) {
      return <Navigate to={appPath(getHomeViewForUser(user))} replace />;
    }
  }

  return <Outlet />;
}
