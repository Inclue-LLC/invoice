import { useEffect, useState } from 'react';
import { EMPTY_CLIENT, createClient, deleteClient, listClients, updateClient, type ClientInput } from '../services/clients';
import { CLIENT_TYPE_LABELS } from '../lib/docTypes';
import type { Client, ClientType, Honorific } from '../types';

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; data: ClientInput } | null>(null);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = () =>
    listClients()
      .then(setClients)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  useEffect(() => {
    void reload();
  }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.data.name.trim()) return setError('取引先名を入力してください');
    setError('');
    try {
      if (editing.id) await updateClient(editing.id, editing.data);
      else await createClient(editing.data);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(`保存に失敗しました: ${String(e)}`);
    }
  };

  const remove = async (c: Client) => {
    if (!confirm(`${c.name} を削除しますか？（作成済みの帳票には影響しません）`)) return;
    await deleteClient(c.id);
    await reload();
  };

  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, [k]: v } } : e));

  const kw = keyword.trim().toLowerCase();
  const shown = clients.filter((c) => !kw || `${c.name} ${c.department} ${c.contactName}`.toLowerCase().includes(kw));

  return (
    <div className="page">
      <div className="page-head">
        <h2>取引先</h2>
        <div className="actions">
          <input placeholder="検索" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <button className="btn btn-primary" onClick={() => setEditing({ id: null, data: { ...EMPTY_CLIENT } })}>
            ＋ 取引先を追加
          </button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {editing && (
        <section className="card">
          <h3>{editing.id ? '取引先の編集' : '取引先の追加'}</h3>
          <div className="grid">
            <label>
              区分
              <select
                value={editing.data.type}
                onChange={(e) => {
                  const t = e.target.value as ClientType;
                  setEditing((ed) =>
                    ed ? { ...ed, data: { ...ed.data, type: t, honorific: t === 'individual' ? '様' : '御中' } } : ed,
                  );
                }}
              >
                {(Object.keys(CLIENT_TYPE_LABELS) as ClientType[]).map((t) => (
                  <option key={t} value={t}>
                    {CLIENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {editing.data.type === 'individual' ? '氏名（屋号）' : '取引先名'} *
              <input
                value={editing.data.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder={editing.data.type === 'individual' ? '山田 太郎' : '株式会社○○'}
              />
            </label>
            <label>
              敬称
              <select value={editing.data.honorific} onChange={(e) => set('honorific', e.target.value as Honorific)}>
                <option value="御中">御中</option>
                <option value="様">様</option>
                <option value="">なし</option>
              </select>
            </label>
            <label>
              部署
              <input value={editing.data.department} onChange={(e) => set('department', e.target.value)} />
            </label>
            <label>
              担当者
              <input value={editing.data.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </label>
            <label>
              郵便番号
              <input value={editing.data.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
            </label>
            <label className="span-2">
              住所
              <textarea rows={2} value={editing.data.address} onChange={(e) => set('address', e.target.value)} />
            </label>
            <label>
              電話番号
              <input value={editing.data.tel} onChange={(e) => set('tel', e.target.value)} />
            </label>
            <label>
              メール
              <input type="email" value={editing.data.email} onChange={(e) => set('email', e.target.value)} />
            </label>
            <label className="checkbox span-2">
              <input
                type="checkbox"
                checked={editing.data.withholding}
                onChange={(e) => set('withholding', e.target.checked)}
              />
              源泉徴収の対象（この取引先を選んだ発注書で、源泉徴収を自動でオンにします）
            </label>
            <label className="span-2">
              メモ
              <textarea rows={2} value={editing.data.memo} onChange={(e) => set('memo', e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => setEditing(null)}>
              キャンセル
            </button>
            <button className="btn btn-primary" onClick={() => void save()}>
              保存
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : shown.length === 0 ? (
        <div className="empty card">取引先が登録されていません。</div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>区分</th>
                <th>取引先名</th>
                <th>部署・担当</th>
                <th>住所</th>
                <th>連絡先</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`badge badge-${c.type}`}>{CLIENT_TYPE_LABELS[c.type]}</span>
                    {c.withholding && <span className="badge badge-withholding">源泉</span>}
                  </td>
                  <td>
                    {c.name} {c.honorific}
                  </td>
                  <td>
                    {c.department} {c.contactName}
                  </td>
                  <td>
                    {c.postalCode && `〒${c.postalCode} `}
                    {c.address}
                  </td>
                  <td>
                    {c.tel}
                    {c.tel && c.email && <br />}
                    {c.email}
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-sm" onClick={() => setEditing({ id: c.id, data: { ...EMPTY_CLIENT, ...c } })}>
                      編集
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => void remove(c)}>
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
