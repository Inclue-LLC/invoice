import { useAuth } from '../contexts/AuthContext';
import { allowedDomain, isFirebaseConfigured } from '../firebase';

export default function Login() {
  const { login, error } = useAuth();
  return (
    <div className="login">
      <div className="login-card">
        <h1>帳票発行ツール</h1>
        <p className="muted">請求書・発注書・納品書・領収書</p>
        {!isFirebaseConfigured && (
          <div className="alert alert-error">
            Firebase の設定が見つかりません。<code>.env</code> を作成してください（README 参照）。
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-lg" onClick={() => void login()}>
          Google アカウントでログイン
        </button>
        {allowedDomain && (
          <p className="muted small">
            @{allowedDomain} のアカウント、または管理者が追加した Google アカウントで利用できます
          </p>
        )}
      </div>
    </div>
  );
}
