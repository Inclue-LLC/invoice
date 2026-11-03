import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DOC_TYPES, DOC_TYPE_ORDER, STATUS_LABELS } from '../lib/docTypes';
import { formatDateJa, formatYen } from '../lib/format';
import { deleteDocument, listDocuments, updateStatus } from '../services/documents';
import type { DocStatus, DocType, StoredDocument } from '../types';

const STATUSES = Object.keys(STATUS_LABELS) as DocStatus[];

export default function DocumentList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState<DocType | ''>('');
  const [status, setStatus] = useState<DocStatus | ''>('');
  const [keyword, setKeyword] = useState('');
  const [month, setMonth] = useState('');

  const reload = () => {
    setLoading(true);
    listDocuments()
      .then(setDocs)
      .catch((e) => setError(`読み込みに失敗しました: ${String(e)}`))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (!type || d.type === type) &&
        (!status || d.status === status) &&
        (!month || d.issueDate.startsWith(month)) &&
        (!kw || [d.number, d.clientName, d.subject].some((v) => v?.toLowerCase().includes(kw))),
    );
  }, [docs, type, status, keyword, month]);

  const sum = filtered.filter((d) => d.status !== 'cancelled').reduce((s, d) => s + (d.totals?.total ?? 0), 0);

  const changeStatus = async (d: StoredDocument, s: DocStatus) => {
    await updateStatus(d.id, s, user?.email ?? '');
    setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: s } : x)));
  };

  const remove = async (d: StoredDocument) => {
    if (!confirm(`${DOC_TYPES[d.type].label} ${d.number} を削除します。よろしいですか？`)) return;
    await deleteDocument(d.id);
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>帳票一覧</h2>
        <div className="actions">
          {DOC_TYPE_ORDER.map((t) => (
            <button key={t} className="btn btn-primary" onClick={() => navigate(`/documents/new?type=${t}`)}>
              ＋ {DOC_TYPES[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="filters card">
        <select value={type} onChange={(e) => setType(e.target.value as DocType | '')}>
          <option value="">すべての種別</option>
          {DOC_TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPES[t].label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as DocStatus | '')}>
          <option value="">すべての状態</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} title="発行月" />
        <input
          className="grow"
          placeholder="番号・取引先・件名で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <span className="muted">
          {filtered.length} 件{type && ` / 合計 ${formatYen(sum)}（取消を除く）`}
        </span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : filtered.length === 0 ? (
        <div className="empty card">帳票がありません。上のボタンから作成してください。</div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>種別</th>
                <th>番号</th>
                <th>発行日</th>
                <th>取引先</th>
                <th>件名</th>
                <th className="num">金額（税込）</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className={d.status === 'cancelled' ? 'row-cancelled' : ''}>
                  <td>
                    <span className={`badge badge-${d.type}`}>{DOC_TYPES[d.type].label}</span>
                  </td>
                  <td>
                    <Link to={`/documents/${d.id}`}>{d.number}</Link>
                  </td>
                  <td>{formatDateJa(d.issueDate)}</td>
                  <td>{d.clientName}</td>
                  <td className="ellipsis">{d.subject}</td>
                  <td className="num">{formatYen(d.totals?.total ?? 0)}</td>
                  <td>
                    <select
                      className={`status status-${d.status}`}
                      value={d.status}
                      onChange={(e) => void changeStatus(d, e.target.value as DocStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="row-actions">
                    <Link className="btn btn-sm" to={`/documents/${d.id}/print`}>
                      印刷/PDF
                    </Link>
                    <Link className="btn btn-sm" to={`/documents/new?type=${d.type}&from=${d.id}`}>
                      複製
                    </Link>
                    <button className="btn btn-sm btn-danger" onClick={() => void remove(d)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && (
        <div className="muted small" style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={reload}>
            再読み込み
          </button>
        </div>
      )}
    </div>
  );
}
