import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  DOC_TYPES,
  WITHHOLDING_PAID_LABEL,
  editPath,
  newPath,
  printPath,
  statusLabel,
  statusesFor,
} from '../lib/docTypes';
import { formatDateJa, formatYen, todayIso } from '../lib/format';
import { deleteDocument, listDocumentsByType, patchDocument, type DocumentPatch } from '../services/documents';
import type { DocStatus, DocType, StoredDocument } from '../types';

/** 11月3日 のような短い日付 */
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}/${Number(m[2])}` : iso;
}

export default function DocumentList({ type }: { type: DocType }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const info = DOC_TYPES[type];
  const isInvoice = type === 'invoice';
  const isPO = type === 'purchase_order';

  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<DocStatus | 'unpaid' | ''>('');
  const [keyword, setKeyword] = useState('');
  const [month, setMonth] = useState('');
  const [busyId, setBusyId] = useState('');

  const reload = () => {
    setLoading(true);
    setError('');
    listDocumentsByType(type)
      .then(setDocs)
      .catch((e) => setError(`読み込みに失敗しました: ${String(e)}`))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setStatus('');
    setKeyword('');
    setMonth('');
    reload();
  }, [type]);

  // 取消以外で、入金（支払）がまだのもの。発注書は源泉徴収税の未払いも含む
  const isUnpaid = (d: StoredDocument) =>
    d.status !== 'cancelled' &&
    (d.status !== 'paid' || (isPO && d.withholdingEnabled && !d.withholdingPaidDate));

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (!status || (status === 'unpaid' ? isUnpaid(d) : d.status === status)) &&
        (!month || d.issueDate.startsWith(month)) &&
        (!kw || [d.number, d.clientName, d.subject].some((v) => v?.toLowerCase().includes(kw))),
    );
  }, [docs, status, keyword, month]);

  const active = filtered.filter((d) => d.status !== 'cancelled');
  const sumTotal = active.reduce((s, d) => s + d.totals.total, 0);
  const sumUnpaid = active
    .filter((d) => d.status !== 'paid')
    .reduce((s, d) => s + (isPO ? d.totals.payable : d.totals.total), 0);
  const sumWithholdingUnpaid = active
    .filter((d) => d.withholdingEnabled && !d.withholdingPaidDate)
    .reduce((s, d) => s + d.totals.withholdingTax, 0);

  const patch = async (d: StoredDocument, p: DocumentPatch) => {
    setBusyId(d.id);
    try {
      await patchDocument(d.id, p, user?.email ?? '');
      setDocs((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...p } : x)));
    } catch (e) {
      setError(`更新に失敗しました: ${String(e)}`);
    } finally {
      setBusyId('');
    }
  };

  const markPaid = (d: StoredDocument) => patch(d, { status: 'paid', paidDate: todayIso() });
  const unmarkPaid = (d: StoredDocument) => {
    if (!confirm(`${d.number} の「${info.paidLabel}」を取り消しますか？`)) return;
    void patch(d, { status: 'issued', paidDate: '' });
  };
  const markWithholdingPaid = (d: StoredDocument) => patch(d, { withholdingPaidDate: todayIso() });
  const unmarkWithholdingPaid = (d: StoredDocument) => {
    if (!confirm(`${d.number} の「${WITHHOLDING_PAID_LABEL}」を取り消しますか？`)) return;
    void patch(d, { withholdingPaidDate: '' });
  };

  const changeStatus = (d: StoredDocument, s: DocStatus) =>
    patch(d, s === 'paid' ? { status: s, paidDate: d.paidDate || todayIso() } : { status: s, paidDate: '' });

  const remove = async (d: StoredDocument) => {
    if (!confirm(`${info.label} ${d.number} を削除します。よろしいですか？`)) return;
    try {
      await deleteDocument(d.id);
      setDocs((prev) => prev.filter((x) => x.id !== d.id));
    } catch (e) {
      setError(`削除に失敗しました: ${String(e)}`);
    }
  };

  const today = todayIso();

  return (
    <div className="page">
      <div className="page-head">
        <h2>{info.label}一覧</h2>
        <div className="actions">
          <button className="btn btn-primary btn-lg" onClick={() => navigate(newPath(type))}>
            ＋ {info.label}を新規作成
          </button>
        </div>
      </div>

      <div className="filters card">
        <select value={status} onChange={(e) => setStatus(e.target.value as DocStatus | 'unpaid' | '')}>
          <option value="">すべての状態</option>
          {info.paidLabel && <option value="unpaid">未{isInvoice ? '入金' : '払い'}のみ</option>}
          {statusesFor(type).map((s) => (
            <option key={s} value={s}>
              {statusLabel(type, s)}
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
        <div className="summary">
          <span>{filtered.length} 件</span>
          <span>合計 {formatYen(sumTotal)}</span>
          {isInvoice && <span className="warn">未入金 {formatYen(sumUnpaid)}</span>}
          {isPO && <span className="warn">未払い {formatYen(sumUnpaid)}</span>}
          {isPO && sumWithholdingUnpaid > 0 && <span className="warn">源泉未払い {formatYen(sumWithholdingUnpaid)}</span>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : filtered.length === 0 ? (
        <div className="empty card">
          <p>{docs.length === 0 ? `${info.label}はまだありません。` : '条件に一致する帳票がありません。'}</p>
          <button className="btn btn-primary" onClick={() => navigate(newPath(type))}>
            ＋ {info.label}を新規作成
          </button>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>番号</th>
                <th>発行日</th>
                <th>{info.recipientLabel}</th>
                <th>件名</th>
                <th className="num">金額（税込）</th>
                {isInvoice && <th>お支払期限</th>}
                <th>状態</th>
                {info.paidLabel && <th>{isInvoice ? '入金' : '支払'}</th>}
                {isPO && <th>源泉</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const busy = busyId === d.id;
                const paid = d.status === 'paid';
                const overdue = isInvoice && !paid && d.status === 'issued' && d.dueDate && d.dueDate < today;
                return (
                  <tr key={d.id} className={d.status === 'cancelled' ? 'row-cancelled' : ''}>
                    <td>
                      <Link to={editPath(type, d.id)}>{d.number}</Link>
                    </td>
                    <td>{formatDateJa(d.issueDate)}</td>
                    <td>
                      {d.clientName}
                      {d.clientType === 'individual' && <span className="badge badge-individual">個人</span>}
                    </td>
                    <td className="ellipsis">{d.subject}</td>
                    <td className="num">
                      {formatYen(d.totals.total)}
                      {d.withholdingEnabled && <div className="muted small">差引 {formatYen(d.totals.payable)}</div>}
                    </td>
                    {isInvoice && (
                      <td className={overdue ? 'overdue' : ''}>
                        {formatDateJa(d.dueDate)}
                        {overdue && <div className="small">期限超過</div>}
                      </td>
                    )}
                    <td>
                      <select
                        className={`status status-${d.status}`}
                        value={d.status}
                        disabled={busy}
                        onChange={(e) => void changeStatus(d, e.target.value as DocStatus)}
                      >
                        {statusesFor(type).map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(type, s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    {info.paidLabel && (
                      <td className="pay-cell">
                        {paid ? (
                          <span className="paid-mark">
                            ✓ {info.paidLabel}
                            {d.paidDate && <span className="small"> {shortDate(d.paidDate)}</span>}
                            <button className="link-btn" disabled={busy} onClick={() => unmarkPaid(d)}>
                              取消
                            </button>
                          </span>
                        ) : d.status !== 'cancelled' ? (
                          <button className="btn btn-sm btn-pay" disabled={busy} onClick={() => void markPaid(d)}>
                            {info.paidLabel}にする
                          </button>
                        ) : null}
                      </td>
                    )}
                    {isPO && (
                      <td className="pay-cell">
                        {!d.withholdingEnabled ? (
                          <span className="muted">—</span>
                        ) : d.withholdingPaidDate ? (
                          <span className="paid-mark">
                            ✓ {WITHHOLDING_PAID_LABEL}
                            <span className="small"> {shortDate(d.withholdingPaidDate)}</span>
                            <button className="link-btn" disabled={busy} onClick={() => unmarkWithholdingPaid(d)}>
                              取消
                            </button>
                          </span>
                        ) : d.status !== 'cancelled' ? (
                          <button
                            className="btn btn-sm btn-pay"
                            disabled={busy}
                            title={`源泉徴収税 ${formatYen(d.totals.withholdingTax)}`}
                            onClick={() => void markWithholdingPaid(d)}
                          >
                            {WITHHOLDING_PAID_LABEL}にする
                            <span className="small">（{formatYen(d.totals.withholdingTax)}）</span>
                          </button>
                        ) : null}
                      </td>
                    )}
                    <td className="row-actions">
                      <Link className="btn btn-sm" to={printPath(type, d.id)}>
                        印刷/PDF
                      </Link>
                      <Link className="btn btn-sm" to={newPath(type, d.id)} title="この帳票をコピーして新規作成">
                        コピー
                      </Link>
                      <button className="btn btn-sm btn-danger" onClick={() => void remove(d)}>
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && (
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={reload}>
            再読み込み
          </button>
        </div>
      )}
    </div>
  );
}
