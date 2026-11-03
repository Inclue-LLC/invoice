import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { DOC_TYPES, DOC_TYPE_ORDER } from '../lib/docTypes';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const currentNewType =
    location.pathname === '/documents/new' ? new URLSearchParams(location.search).get('type') ?? 'invoice' : null;
  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">帳票発行ツール</div>
        <nav>
          <NavLink to="/" end>帳票一覧</NavLink>
          {DOC_TYPE_ORDER.map((t) => (
            <NavLink
              key={t}
              to={`/documents/new?type=${t}`}
              className={() => (currentNewType === t ? 'active' : '')}
            >
              {DOC_TYPES[t].label}作成
            </NavLink>
          ))}
          <NavLink to="/clients">取引先</NavLink>
          <NavLink to="/settings">自社設定</NavLink>
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
