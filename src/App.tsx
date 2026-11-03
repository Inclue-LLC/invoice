import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Clients from './pages/Clients';
import DocumentEdit from './pages/DocumentEdit';
import DocumentList from './pages/DocumentList';
import DocumentPrint from './pages/DocumentPrint';
import Login from './pages/Login';
import Settings from './pages/Settings';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen muted">読み込み中…</div>;
  if (!user) return <Login />;

  return (
    <SettingsProvider>
      <Routes>
        <Route path="/documents/:id/print" element={<DocumentPrint />} />
        <Route element={<Layout />}>
          <Route path="/" element={<DocumentList />} />
          <Route path="/documents/new" element={<DocumentEdit />} />
          <Route path="/documents/:id" element={<DocumentEdit />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SettingsProvider>
  );
}
