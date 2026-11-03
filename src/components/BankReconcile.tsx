import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  decodeFile,
  detectMapping,
  extractTransactions,
  parseCsv,
  type BankTransaction,
  type ColumnMapping,
} from '../lib/bankStatement';
import { formatDateJa, formatYen } from '../lib/format';
import {
  AUTO_APPLY_KINDS,
  MATCH_LABELS,
  extractPayerName,
  nameMatches,
  reconcile,
  splitTransferNames,
  type InvoiceForMatch,
  type MatchProposal,
} from '../lib/reconcile';
import { listClients, updateClient } from '../services/clients';
import { patchDocument, type DocumentPatch } from '../services/documents';
import type { Client, StoredDocument } from '../types';

interface Props {
  /** 請求書（すべて。未入金のものだけを照合に使う） */
  invoices: StoredDocument[];
  onClose: () => void;
  onApplied: (patches: { id: string; patch: DocumentPatch }[]) => void;
}

interface Selection {
  /** 請求書IDのカンマ区切り（'' は対応なし） */
  value: string;
  apply: boolean;
}

const EMPTY_MAPPING: ColumnMapping = {
  headerRow: -1,
  date: -1,
  description: [],
  deposit: -1,
  withdrawal: -1,
  amount: -1,
  kind: -1,
};

export default function BankReconcile({ invoices, onClose, onApplied }: Props) {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [autoDetected, setAutoDetected] = useState(true);
  const [showMapping, setShowMapping] = useState(false);
  const [selections, setSelections] = useState<Record<number, Selection>>({});
  const [saveNames, setSaveNames] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch(() => undefined);
  }, []);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const unpaid = useMemo(
    () => invoices.filter((d) => d.status !== 'paid' && d.status !== 'cancelled'),
    [invoices],
  );
  const invoiceById = useMemo(() => new Map(unpaid.map((d) => [d.id, d])), [unpaid]);
  const forMatch: InvoiceForMatch[] = useMemo(
    () =>
      unpaid.map((d) => ({
        id: d.id,
        number: d.number,
        clientId: d.clientId,
        clientName: d.clientName,
        total: d.totals.total,
        issueDate: d.issueDate,
        dueDate: d.dueDate,
      })),
    [unpaid],
  );
  const namesOf = useMemo(
    () => (inv: { clientId: string | null; clientName: string }) => [
      inv.clientName,
      ...splitTransferNames(inv.clientId ? clientById.get(inv.clientId)?.transferNames : ''),
    ],
    [clientById],
  );

  const txs: BankTransaction[] = useMemo(
    () => (mapping && mapping.date >= 0 && (mapping.deposit >= 0 || mapping.amount >= 0) ? extractTransactions(rows, mapping) : []),
    [rows, mapping],
  );
  const proposals: (MatchProposal | null)[] = useMemo(() => reconcile(txs, forMatch, namesOf), [txs, forMatch, namesOf]);

  // 照合結果が変わったら選択状態を初期化する
  useEffect(() => {
    const next: Record<number, Selection> = {};
    txs.forEach((t, i) => {
      if (t.deposit <= 0) return;
      const p = proposals[i];
      next[i] = p ? { value: p.invoiceIds.join(','), apply: AUTO_APPLY_KINDS.includes(p.kind) } : { value: '', apply: false };
    });
    setSelections(next);
  }, [txs, proposals]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setDone('');
    try {
      const text = decodeFile(await file.arrayBuffer());
      const parsed = parseCsv(text);
      if (parsed.length === 0) throw new Error('ファイルにデータがありません');
      const detected = detectMapping(parsed);
      setFileName(file.name);
      setRows(parsed);
      setMapping(detected ?? { ...EMPTY_MAPPING });
      setAutoDetected(Boolean(detected));
      setShowMapping(!detected);
    } catch (e) {
      setError(`ファイルを読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const depositIdx = txs.map((t, i) => (t.deposit > 0 ? i : -1)).filter((i) => i >= 0);
  const withdrawalCount = txs.filter((t) => t.deposit <= 0).length;
  const matchedIdx = depositIdx.filter((i) => proposals[i]);
  const unmatchedIdx = depositIdx.filter((i) => !proposals[i]);

  const idsOf = (sel?: Selection) => (sel?.value ? sel.value.split(',') : []);
  const applied = depositIdx.filter((i) => selections[i]?.apply && selections[i]?.value);
  const useCount = new Map<string, number>();
  applied.forEach((i) => idsOf(selections[i]).forEach((id) => useCount.set(id, (useCount.get(id) ?? 0) + 1)));
  const duplicated = new Set([...useCount].filter(([, n]) => n > 1).map(([id]) => id));

  const setSel = (i: number, s: Partial<Selection>) =>
    setSelections((prev) => ({ ...prev, [i]: { ...prev[i], ...s } }));

  const columnLabel = (c: number) => {
    const head = mapping && mapping.headerRow >= 0 ? rows[mapping.headerRow]?.[c] : '';
    const sample = rows[(mapping?.headerRow ?? -1) + 1]?.[c] ?? '';
    return `${head || `列${c + 1}`}${sample ? `（例: ${sample.slice(0, 16)}）` : ''}`;
  };
  const colCount = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  const columnOptions = Array.from({ length: colCount }, (_, c) => c);

  const apply = async () => {
    if (duplicated.size) return setError('同じ請求書が複数の入金に割り当てられています。選択を見直してください。');
    if (applied.length === 0) return setError('入金済にする行にチェックを入れてください。');
    setBusy(true);
    setError('');
    const patches: { id: string; patch: DocumentPatch }[] = [];
    const newNames = new Map<string, string[]>();
    try {
      for (const i of applied) {
        const t = txs[i];
        const ids = idsOf(selections[i]);
        const total = ids.reduce((s, id) => s + (invoiceById.get(id)?.totals.total ?? 0), 0);
        const diff = total - t.deposit;
        const memo = [
          `銀行入金 ${formatDateJa(t.date)}`,
          t.description,
          formatYen(t.deposit),
          ids.length > 1 ? `（${ids.length}件まとめて）` : '',
          diff ? `（差額 ${formatYen(diff)}）` : '',
        ]
          .filter(Boolean)
          .join(' ');
        for (const id of ids) {
          const patch: DocumentPatch = { status: 'paid', paidDate: t.date, paymentMemo: memo };
          await patchDocument(id, patch, user?.email ?? '');
          patches.push({ id, patch });
          // 名義で照合できなかった入金は、振込名義を取引先に登録して次回から使う
          const inv = invoiceById.get(id);
          if (saveNames && inv?.clientId && clientById.has(inv.clientId) && !nameMatches(t.description, namesOf(inv))) {
            const payer = extractPayerName(t.description);
            if (payer) newNames.set(inv.clientId, [...(newNames.get(inv.clientId) ?? []), payer]);
          }
        }
      }
      let savedClients = 0;
      for (const [clientId, names] of newNames) {
        const c = clientById.get(clientId)!;
        const merged = [...new Set([...splitTransferNames(c.transferNames), ...names])];
        const { id, ...rest } = c;
        await updateClient(id, { ...rest, transferNames: merged.join('\n') });
        savedClients++;
      }
      onApplied(patches);
      setDone(
        `${patches.length} 件の請求書を入金済にしました。` +
          (savedClients ? `振込名義を ${savedClients} 件の取引先に登録しました（次回から名義で照合されます）。` : ''),
      );
    } catch (e) {
      if (patches.length) onApplied(patches);
      setError(`更新中にエラーが発生しました（${patches.length} 件は入金済にしました）: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (i: number) => {
    const t = txs[i];
    const p = proposals[i];
    const sel = selections[i] ?? { value: '', apply: false };
    const ids = idsOf(sel);
    const isProposal = p && sel.value === p.invoiceIds.join(',');
    const total = ids.reduce((s, id) => s + (invoiceById.get(id)?.totals.total ?? 0), 0);
    const diff = ids.length ? total - t.deposit : 0;
    const dup = ids.some((id) => duplicated.has(id)) && sel.apply;
    // 候補の並び: 同額 → 名義一致 → その他
    const options = [...unpaid].sort((a, b) => {
      const rank = (d: StoredDocument) =>
        (d.totals.total === t.deposit ? 0 : 2) + (nameMatches(t.description, namesOf(d)) ? 0 : 1);
      return rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate);
    });
    const kindLabel = !ids.length ? '' : isProposal ? MATCH_LABELS[p!.kind] : '手動';
    const kindClass = !ids.length ? '' : isProposal ? `kind-${p!.kind}` : 'kind-manual';
    return (
      <tr key={i} className={dup ? 'row-dup' : ''}>
        <td className="center">
          <input
            type="checkbox"
            className="inline-check"
            disabled={!sel.value}
            checked={sel.apply && Boolean(sel.value)}
            onChange={(e) => setSel(i, { apply: e.target.checked })}
          />
        </td>
        <td className="nowrap">{formatDateJa(t.date)}</td>
        <td className="ellipsis" title={t.description}>
          {t.description || <span className="muted">（摘要なし）</span>}
        </td>
        <td className="num">{formatYen(t.deposit)}</td>
        <td>
          <select
            value={sel.value}
            onChange={(e) => setSel(i, { value: e.target.value, apply: Boolean(e.target.value) })}
          >
            <option value="">— 対応する請求書なし —</option>
            {p && p.invoiceIds.length > 1 && (
              <option value={p.invoiceIds.join(',')}>
                {p.invoiceIds.map((id) => invoiceById.get(id)?.number).join(' + ')}（まとめて{' '}
                {formatYen(p.invoiceIds.reduce((s, id) => s + (invoiceById.get(id)?.totals.total ?? 0), 0))}）
              </option>
            )}
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.number} {d.clientName} {formatYen(d.totals.total)}
              </option>
            ))}
          </select>
          {dup && <div className="small error-text">同じ請求書が他の入金にも選ばれています</div>}
        </td>
        <td className="nowrap">
          {kindLabel && <span className={`kind ${kindClass}`}>{kindLabel}</span>}
          {diff !== 0 && <div className="small muted">差額 {formatYen(diff)}</div>}
        </td>
      </tr>
    );
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-label="銀行明細で入金消込">
        <div className="modal-head">
          <h2>銀行明細で入金消込</h2>
          <button className="btn" onClick={onClose} disabled={busy}>
            閉じる
          </button>
        </div>

        {done ? (
          <>
            <div className="alert alert-ok">{done}</div>
            <div className="actions">
              <button className="btn btn-primary" onClick={onClose}>
                一覧に戻る
              </button>
            </div>
          </>
        ) : (
          <>
            <section className="card">
              <p style={{ marginTop: 0 }}>
                ネットバンキングからダウンロードした<strong>入出金明細（CSV）</strong>を選んでください。入金と未入金の請求書（{unpaid.length}{' '}
                件）を自動で照合します。
              </p>
              <input type="file" accept=".csv,.txt,.tsv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
              <p className="muted small" style={{ marginBottom: 0 }}>
                ファイルはこのブラウザの中だけで読み込み、サーバーには保存しません。Shift_JIS / UTF-8 のどちらでも読み込めます。
              </p>
            </section>

            {error && <div className="alert alert-error">{error}</div>}

            {mapping && (
              <section className="card">
                <div className="mapping-summary">
                  <span>
                    <strong>{fileName}</strong>
                  </span>
                  <span>入金 {depositIdx.length} 件</span>
                  {withdrawalCount > 0 && <span className="muted">出金 {withdrawalCount} 件は対象外</span>}
                  <span>照合 {matchedIdx.length} 件</span>
                  <button className="btn btn-sm" onClick={() => setShowMapping((v) => !v)}>
                    列の指定{showMapping ? 'を閉じる' : 'を確認・変更'}
                  </button>
                </div>
                {!autoDetected && (
                  <div className="alert" style={{ marginTop: 12 }}>
                    列を自動で判定できませんでした。日付・入金額・摘要（振込名義）の列を指定してください。
                  </div>
                )}
                {showMapping && (
                  <div className="grid" style={{ marginTop: 12 }}>
                    <label>
                      日付の列
                      <select
                        value={mapping.date}
                        onChange={(e) => setMapping({ ...mapping, date: Number(e.target.value) })}
                      >
                        <option value={-1}>選択してください</option>
                        {columnOptions.map((c) => (
                          <option key={c} value={c}>
                            {columnLabel(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      入金額の列
                      <select
                        value={mapping.deposit >= 0 ? mapping.deposit : mapping.amount}
                        onChange={(e) =>
                          setMapping({ ...mapping, deposit: Number(e.target.value), amount: -1, kind: -1, withdrawal: -1 })
                        }
                      >
                        <option value={-1}>選択してください</option>
                        {columnOptions.map((c) => (
                          <option key={c} value={c}>
                            {columnLabel(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="span-2">
                      摘要・振込名義の列
                      <select
                        value={mapping.description[0] ?? -1}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setMapping({ ...mapping, description: v >= 0 ? [v, ...mapping.description.slice(1).filter((x) => x !== v)] : [] });
                        }}
                      >
                        <option value={-1}>（なし）</option>
                        {columnOptions.map((c) => (
                          <option key={c} value={c}>
                            {columnLabel(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ヘッダー行
                      <select
                        value={mapping.headerRow}
                        onChange={(e) => setMapping({ ...mapping, headerRow: Number(e.target.value) })}
                      >
                        <option value={-1}>なし（1行目からデータ）</option>
                        {rows.slice(0, 10).map((r, idx) => (
                          <option key={idx} value={idx}>
                            {idx + 1}行目: {r.join(' / ').slice(0, 40)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </section>
            )}

            {mapping && depositIdx.length > 0 && (
              <>
                <section className="card table-wrap">
                  <div className="section-title">照合できた入金（{matchedIdx.length} 件）</div>
                  {matchedIdx.length === 0 ? (
                    <p className="muted" style={{ padding: '0 16px' }}>
                      自動で照合できた入金はありません。下の一覧から手動で請求書を選べます。
                    </p>
                  ) : (
                    <ReconcileTable>{matchedIdx.map(renderRow)}</ReconcileTable>
                  )}
                </section>
                {unmatchedIdx.length > 0 && (
                  <details className="card table-wrap">
                    <summary className="section-title">照合できなかった入金（{unmatchedIdx.length} 件）— 手動で選択できます</summary>
                    <ReconcileTable>{unmatchedIdx.map(renderRow)}</ReconcileTable>
                  </details>
                )}

                <div className="reconcile-footer">
                  <label className="checkbox-inline">
                    <input type="checkbox" checked={saveNames} onChange={(e) => setSaveNames(e.target.checked)} />
                    名義で照合できなかった入金の振込名義を、取引先マスタに登録して次回から使う
                  </label>
                  <div className="actions">
                    <span className="muted">
                      判定: <span className="kind kind-certain">金額・名義一致</span>{' '}
                      <span className="kind kind-amount">金額一致</span> は最初からチェック済み。
                      <span className="kind kind-ambiguous">要確認</span>{' '}
                      <span className="kind kind-fee">手数料差引？</span> は内容を確認してチェックしてください。
                    </span>
                    <button className="btn btn-primary btn-lg" disabled={busy || applied.length === 0} onClick={() => void apply()}>
                      {busy ? '更新中…' : `チェックした ${applied.length} 件を入金済にする`}
                    </button>
                  </div>
                </div>
              </>
            )}
            {mapping && autoDetected && depositIdx.length === 0 && txs.length > 0 && (
              <div className="alert">このファイルには入金がありません。</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReconcileTable({ children }: { children: ReactNode }) {
  return (
    <table className="table reconcile-table">
      <thead>
        <tr>
          <th style={{ width: 40 }} className="center">
            消込
          </th>
          <th style={{ width: 130 }}>入金日</th>
          <th>摘要（振込名義）</th>
          <th style={{ width: 110 }} className="num">
            入金額
          </th>
          <th style={{ width: 340 }}>請求書</th>
          <th style={{ width: 120 }}>判定</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
