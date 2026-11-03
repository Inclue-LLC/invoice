import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { allowedDomain, auth } from '../firebase';
import { isInvited } from '../services/members';

interface AuthState {
  user: User | null;
  /** 社内ドメイン（@inclue-llc.jp）のユーザーか。ユーザー管理はこのユーザーのみ */
  isDomainUser: boolean;
  loading: boolean;
  error: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function inDomain(user: User): boolean {
  if (!allowedDomain) return true;
  return Boolean(user.email && user.emailVerified && user.email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isDomainUser, setIsDomainUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setIsDomainUser(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const domain = inDomain(u);
      // 社外のアカウントは「ユーザー管理」で招待されている場合のみ許可
      const allowed = domain || (u.emailVerified && Boolean(u.email) && (await isInvited(u.email!)));
      if (!allowed) {
        setError(
          `${u.email} ではログインできません。@${allowedDomain} のアカウントを使うか、管理者にユーザー追加を依頼してください。`,
        );
        await signOut(auth);
        setUser(null);
        setIsDomainUser(false);
      } else {
        setUser(u);
        setIsDomainUser(domain);
      }
      setLoading(false);
    });
  }, []);

  const login = async () => {
    setError('');
    const provider = new GoogleAuthProvider();
    // 社外アカウントも選べるよう、ドメインの指定（hd）はしない
    provider.setCustomParameters({ prompt: 'select_account' });
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

  return (
    <AuthContext.Provider value={{ user, isDomainUser, loading, error, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
