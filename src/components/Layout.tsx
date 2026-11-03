import { NavLink, Outlet } from 'react-router-dom';
import { DOC_TYPES, DOC_TYPE_ORDER, listPath } from '../lib/docTypes';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, isDomainUser, logout } = useAuth();
  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">帳票発行ツール</div>
        <nav>
          {DOC_TYPE_ORDER.map((t) => (
            <NavLink key={t} to={listPath(t)}>
              {DOC_TYPES[t].label}
            </NavLink>
          ))}
          <span className="nav-sep" />
          <NavLink to="/clients">取引先</NavLink>
          <NavLink to="/settings">自社設定</NavLink>
          {isDomainUser && <NavLink to="/users">ユーザー管理</NavLink>}
        </nav>
        <div className="user">
          <span title={user?.email ?? ''}>{user?.displayName ?? user?.email}</span>
          <button className="btn btn-sm" onClick={() => void logout()}>
            ログアウト
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
