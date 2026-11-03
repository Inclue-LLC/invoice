import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { allowedDomain } from '../firebase';
import { addMember, listMembers, normalizeEmail, removeMember, type Member } from '../services/members';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Users() {
  const { user, isDomainUser } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');

  const reload = () =>
    listMembers()
      .then(setMembers)
      .catch((e) => setError(`読み込みに失敗しました: ${String(e)}`))
      .finally(() => setLoading(false));
  useEffect(() => {
    if (isDomainUser) void reload();
  }, [isDomainUser]);

  if (!isDomainUser) {
    return (
      <div className="page narrow">
        <div className="alert">ユーザー管理は @{allowedDomain} のアカウントでのみ利用できます。</div>
      </div>
    );
  }

  const add = async () => {
    setError('');
    setMessage('');
    const e = normalizeEmail(email);
    if (!EMAIL_RE.test(e)) return setError('メールアドレスを正しく入力してください');
    if (allowedDomain && e.endsWith(`@${allowedDomain}`)) {
      return setError(`@${allowedDomain} のアカウントは追加しなくてもログインできます`);
    }
    if (members.some((m) => m.email === e)) return setError('このメールアドレスは追加済みです');
    try {
      await addMember({ email: e, name: name.trim(), memo: memo.trim(), addedBy: user?.email ?? '' });
      setEmail('');
      setName('');
      setMemo('');
      setMessage(`${e} を追加しました。この Google アカウントでログインできるようになります。`);
      await reload();
    } catch (err) {
      setError(`追加に失敗しました: ${String(err)}`);
    }
  };

  const remove = async (m: Member) => {
    if (!confirm(`${m.email} を削除しますか？このアカウントではログインできなくなります。`)) return;
    try {
      await removeMember(m.email);
      await reload();
    } catch (err) {
      setError(`削除に失敗しました: ${String(err)}`);
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <h2>ユーザー管理</h2>
      </div>
      {message && <div className="alert alert-ok">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="card">
        <p style={{ marginTop: 0 }}>
          <strong>@{allowedDomain}</strong> の Google アカウントは、追加しなくても全員ログインできます。
          <br />
          それ以外の Google アカウント（Gmail など。社外の経理担当者・税理士など）は、ここに追加した人だけがログインできます。
        </p>
        <h3>ユーザーを追加</h3>
        <div className="grid">
          <label className="span-2">
            Google アカウントのメールアドレス *
            <input
              type="email"
              value={email}
              placeholder="example@gmail.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
            />
          </label>
          <label>
            氏名
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            メモ
            <input value={memo} placeholder="例: 顧問税理士" onChange={(e) => setMemo(e.target.value)} />
          </label>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => void add()}>
            ＋ 追加
          </button>
        </div>
        <p className="muted small">
          追加された人は帳票・取引先・自社設定を閲覧・編集できます（ユーザー管理は除く）。
        </p>
      </section>

      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : members.length === 0 ? (
        <div className="empty card">追加したユーザーはいません。</div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>メールアドレス</th>
                <th>氏名</th>
                <th>メモ</th>
                <th>追加した人</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email}>
                  <td>{m.email}</td>
                  <td>{m.name}</td>
                  <td>{m.memo}</td>
                  <td className="muted small">{m.addedBy}</td>
                  <td className="row-actions">
                    <button className="btn btn-sm btn-danger" onClick={() => void remove(m)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
