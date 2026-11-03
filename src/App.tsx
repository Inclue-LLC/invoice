import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { DOC_TYPES, DOC_TYPE_ORDER } from './lib/docTypes';
import Clients from './pages/Clients';
import DocumentEdit from './pages/DocumentEdit';
import DocumentList from './pages/DocumentList';
import DocumentPrint from './pages/DocumentPrint';
import Login from './pages/Login';
import Sales from './pages/Sales';
import Settings from './pages/Settings';
import Users from './pages/Users';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen muted">読み込み中…</div>;
  if (!user) return <Login />;

  return (
    <SettingsProvider>
      <Routes>
        {DOC_TYPE_ORDER.map((t) => (
          <Route key={`${t}-print`} path={`/${DOC_TYPES[t].path}/:id/print`} element={<DocumentPrint type={t} />} />
        ))}
        <Route element={<Layout />}>
          {/* 最初のページは売上管理 */}
          <Route path="/" element={<Navigate to="/sales" replace />} />
          <Route path="/sales" element={<Sales />} />
          {DOC_TYPE_ORDER.map((t) => (
            <Route key={t} path={`/${DOC_TYPES[t].path}`}>
              <Route index element={<DocumentList key={t} type={t} />} />
              <Route path="new" element={<DocumentEdit key={`${t}-new`} type={t} />} />
              <Route path=":id" element={<DocumentEdit key={`${t}-edit`} type={t} />} />
            </Route>
          ))}
          <Route path="/clients" element={<Clients />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<Navigate to="/sales" replace />} />
        </Route>
      </Routes>
    </SettingsProvider>
  );
}
