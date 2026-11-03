import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { allowedDomain, auth } from '../firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function isAllowed(user: User): boolean {
  if (!allowedDomain) return true;
  return Boolean(user.email && user.emailVerified && user.email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u && !isAllowed(u)) {
        setError(`${u.email} ではログインできません。@${allowedDomain} のアカウントを使用してください。`);
        await signOut(auth);
        setUser(null);
      } else {
        setUser(u);
      }
      setLoading(false);
    });
  }, []);

  const login = async () => {
    setError('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters(allowedDomain ? { hd: allowedDomain, prompt: 'select_account' } : { prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(`ログインに失敗しました（${code ?? String(e)}）`);
      }
    }
  };

  const logout = () => signOut(auth);

  return <AuthContext.Provider value={{ user, loading, error, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
