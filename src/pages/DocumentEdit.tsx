import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DocumentPreview from '../components/DocumentPreview';
import ItemsEditor from '../components/ItemsEditor';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { calcTotals, newItem } from '../lib/calc';
import { CLIENT_TYPE_LABELS, DOC_TYPES, DOC_TYPE_ORDER, STATUS_LABELS, isDocType } from '../lib/docTypes';
import { calcDueDate, todayIso } from '../lib/format';
import { listClients } from '../services/clients';
import { createDocument, getDocument, nextDocumentNumber, updateDocument } from '../services/documents';
import type { Client, ClientType, CompanySettings, DocStatus, DocType, DocumentData, Honorific } from '../types';

function blankDocument(type: DocType, s: CompanySettings, email: string): DocumentData {
  const issueDate = todayIso();
  return {
    type,
    number: '',
    status: 'draft',
    issueDate,
    clientId: null,
    clientType: 'corporate',
    clientName: '',
    clientHonorific: '御中',
    clientPostalCode: '',
    clientAddress: '',
    subject: '',
    items: [newItem()],
    notes: s.defaultNotes[type] ?? '',
    taxMode: s.defaultTaxMode,
    rounding: s.defaultRounding,
    withholdingEnabled: false,
    withholdingBaseMode: 'net',
    totals: { subtotal: 0, tax: 0, total: 0, byRate: [], withholdingBase: 0, withholdingTax: 0, payable: 0 },
    dueDate: type === 'invoice' ? calcDueDate(issueDate, s.invoiceDueDays) : '',
    bankInfo: type === 'invoice' ? s.bankInfo : '',
    deliveryDate: type === 'delivery_note' ? issueDate : '',
    deliveryPlace: '',
    paymentTerms: '',
    receiptPurpose: '',
    paymentMethod: type === 'receipt' ? '銀行振込' : '',
    sourceDocId: null,
    createdBy: email,
    updatedBy: email,
  };
}

/** 既存の帳票から別種別（または同種別）の新規帳票を作る */
function deriveDocument(src: DocumentData, srcId: string, type: DocType, s: CompanySettings, email: string): DocumentData {
  const base = blankDocument(type, s, email);
  return {
    ...base,
    clientId: src.clientId,
    clientType: src.clientType,
    clientName: src.clientName,
    clientHonorific: src.clientHonorific,
    clientPostalCode: src.clientPostalCode,
    clientAddress: src.clientAddress,
    subject: src.subject,
    items: src.items.map((i) => ({ ...i, id: newItem().id })),
    notes: src.type === type ? src.notes : base.notes,
    taxMode: src.taxMode,
    rounding: src.rounding,
    withholdingEnabled: DOC_TYPES[type].supportsWithholding && src.withholdingEnabled,
    withholdingBaseMode: src.withholdingBaseMode,
    deliveryPlace: src.deliveryPlace ?? '',
    paymentTerms: src.paymentTerms ?? '',
    receiptPurpose: type === 'receipt' ? src.receiptPurpose || src.subject || 'お品代' : '',
    paymentMethod: src.paymentMethod || base.paymentMethod,
    sourceDocId: srcId,
  };
}

export default function DocumentEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const email = user?.email ?? '';

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const qType = params.get('type');
  const fromId = params.get('from');

  useEffect(() => {
    listClients().then(setClients).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (settingsLoading) return;
    setError('');
    setDoc(null);
    (async () => {
      if (id) {
        const d = await getDocument(id);
        if (!d) throw new Error('帳票が見つかりません');
        const { id: _omit, ...rest } = d;
        void _omit;
        setDoc(rest);
      } else {
        const type: DocType = isDocType(qType) ? qType : 'invoice';
        if (fromId) {
          const src = await getDocument(fromId);
          if (!src) throw new Error('複製元の帳票が見つかりません');
          setDoc(deriveDocument(src, fromId, type, settings, email));
        } else {
          setDoc(blankDocument(type, settings, email));
        }
      }
    })().catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [id, qType, fromId, settingsLoading, settings, email]);

  const totals = useMemo(
    () =>
      doc
        ? calcTotals(doc.items, doc.taxMode, doc.rounding, {
            enabled: DOC_TYPES[doc.type].supportsWithholding && doc.withholdingEnabled,
            baseMode: doc.withholdingBaseMode,
          })
        : null,
    [doc?.items, doc?.taxMode, doc?.rounding, doc?.withholdingEnabled, doc?.withholdingBaseMode],
  );

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!doc || !totals) return <div className="page"><p className="muted">読み込み中…</p></div>;

  const info = DOC_TYPES[doc.type];
  const set = <K extends keyof DocumentData>(key: K, value: DocumentData[K]) =>
    setDoc((d) => (d ? { ...d, [key]: value } : d));

  const selectClient = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId);
    setDoc((d) =>
      d
        ? c
          ? {
              ...d,
              clientId: c.id,
              clientType: c.type,
              clientName: c.department ? `${c.name} ${c.department}` : c.name,
              clientHonorific: c.honorific,
              clientPostalCode: c.postalCode,
              clientAddress: c.address,
              withholdingEnabled: DOC_TYPES[d.type].supportsWithholding && c.withholding,
            }
          : { ...d, clientId: null }
        : d,
    );
  };

  const changeClientType = (t: ClientType) =>
    setDoc((d) => (d ? { ...d, clientType: t, clientHonorific: t === 'individual' ? '様' : '御中' } : d));

  const changeIssueDate = (v: string) => {
    setDoc((d) => {
      if (!d) return d;
      const next = { ...d, issueDate: v };
      // 新規作成時は発行日に合わせて支払期限を再計算
      if (!id && d.type === 'invoice') next.dueDate = calcDueDate(v, settings.invoiceDueDays);
      return next;
    });
  };

  const save = async (afterSave: 'stay' | 'print') => {
    setError('');
    if (!doc.clientName.trim()) return setError(`${info.recipientLabel}を入力してください`);
    const items = doc.items.filter((i) => i.name.trim() || i.unitPrice);
    if (items.length === 0) return setError('明細を1行以上入力してください');
    setSaving(true);
    try {
      const data: DocumentData = {
        ...doc,
        items,
        withholdingEnabled: info.supportsWithholding && doc.withholdingEnabled,
        totals: calcTotals(items, doc.taxMode, doc.rounding, {
          enabled: info.supportsWithholding && doc.withholdingEnabled,
          baseMode: doc.withholdingBaseMode,
        }),
        updatedBy: email,
      };
      let docId = id;
      if (docId) {
        await updateDocument(docId, data);
      } else {
        if (!data.number.trim()) {
          data.number = await nextDocumentNumber(data.type, settings.prefixes[data.type], data.issueDate);
        }
        data.createdBy = email;
        docId = await createDocument(data);
      }
      setDoc(data);
      navigate(afterSave === 'print' ? `/documents/${docId}/print` : `/documents/${docId}`, { replace: !id });
    } catch (e) {
      setError(`保存に失敗しました: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const previewDoc: DocumentData = { ...doc, totals, number: doc.number || '（保存時に採番）' };

  return (
    <div className="page">
      <div className="page-head">
        <h2>
          {info.label}
          {id ? `の編集 ${doc.number}` : 'の作成'}
        </h2>
        <div className="actions">
          <button className="btn" onClick={() => setShowPreview((v) => !v)}>
            プレビュー{showPreview ? 'を隠す' : 'を表示'}
          </button>
          {id && (
            <div className="dropdown">
              <select
                className="btn"
                value=""
                onChange={(e) => e.target.value && navigate(`/documents/new?type=${e.target.value}&from=${id}`)}
              >
                <option value="">この内容で作成…</option>
                {DOC_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPES[t].label}を作成
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn" disabled={saving} onClick={() => void save('stay')}>
            保存
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void save('print')}>
            保存して印刷 / PDF
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!settings.name && (
        <div className="alert">
          自社情報が未設定です。<Link to="/settings">自社設定</Link>で会社名・登録番号などを登録してください。
        </div>
      )}

      <div className={`editor ${showPreview ? 'with-preview' : ''}`}>
        <div className="editor-form">
          <section className="card">
            <h3>基本情報</h3>
            <div className="grid">
              <label>
                種別
                <select
                  value={doc.type}
                  disabled={Boolean(id)}
                  onChange={(e) => navigate(`/documents/new?type=${e.target.value}`, { replace: true })}
                >
                  {DOC_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {DOC_TYPES[t].label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                番号
                <input
                  value={doc.number}
                  placeholder="空欄で自動採番"
                  onChange={(e) => set('number', e.target.value)}
                />
              </label>
              <label>
                {doc.type === 'receipt' ? '領収日' : '発行日'}
                <input type="date" value={doc.issueDate} onChange={(e) => changeIssueDate(e.target.value)} />
              </label>
              <label>
                状態
                <select value={doc.status} onChange={(e) => set('status', e.target.value as DocStatus)}>
                  {(Object.keys(STATUS_LABELS) as DocStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card">
            <h3>{info.recipientLabel}</h3>
            <div className="grid">
              <label className="span-2">
                取引先マスタから選択
                <select value={doc.clientId ?? ''} onChange={(e) => selectClient(e.target.value)}>
                  <option value="">（直接入力）</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.department ? ` ${c.department}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                区分
                <select value={doc.clientType} onChange={(e) => changeClientType(e.target.value as ClientType)}>
                  {(Object.keys(CLIENT_TYPE_LABELS) as ClientType[]).map((t) => (
                    <option key={t} value={t}>
                      {CLIENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {doc.clientType === 'individual' ? '氏名（屋号）' : '名称'} *
                <input value={doc.clientName} onChange={(e) => set('clientName', e.target.value)} />
              </label>
              <label>
                敬称
                <select
                  value={doc.clientHonorific}
                  onChange={(e) => set('clientHonorific', e.target.value as Honorific)}
                >
                  <option value="御中">御中</option>
                  <option value="様">様</option>
                  <option value="">なし</option>
                </select>
              </label>
              <label>
                郵便番号
                <input value={doc.clientPostalCode} onChange={(e) => set('clientPostalCode', e.target.value)} />
              </label>
              <label className="span-2">
                住所
                <textarea rows={2} value={doc.clientAddress} onChange={(e) => set('clientAddress', e.target.value)} />
              </label>
            </div>
          </section>

          <section className="card">
            <h3>内容</h3>
            <div className="grid">
              <label className="span-2">
                件名
                <input value={doc.subject} onChange={(e) => set('subject', e.target.value)} />
              </label>
              {doc.type === 'invoice' && (
                <label>
                  お支払期限
                  <input type="date" value={doc.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
                </label>
              )}
              {(doc.type === 'purchase_order' || doc.type === 'delivery_note') && (
                <label>
                  {doc.type === 'purchase_order' ? '納期' : '納品日'}
                  <input type="date" value={doc.deliveryDate} onChange={(e) => set('deliveryDate', e.target.value)} />
                </label>
              )}
              {doc.type === 'purchase_order' && (
                <>
                  <label>
                    納品場所
                    <input value={doc.deliveryPlace} onChange={(e) => set('deliveryPlace', e.target.value)} />
                  </label>
                  <label>
                    支払条件
                    <input
                      value={doc.paymentTerms}
                      placeholder="例: 月末締め翌月末払い"
                      onChange={(e) => set('paymentTerms', e.target.value)}
                    />
                  </label>
                </>
              )}
              {doc.type === 'receipt' && (
                <>
                  <label className="span-2">
                    但し書き
                    <input
                      value={doc.receiptPurpose}
                      placeholder="例: お品代"
                      onChange={(e) => set('receiptPurpose', e.target.value)}
                    />
                  </label>
                  <label>
                    お支払方法
                    <input
                      list="payment-methods"
                      value={doc.paymentMethod}
                      onChange={(e) => set('paymentMethod', e.target.value)}
                    />
                    <datalist id="payment-methods">
                      <option value="現金" />
                      <option value="銀行振込" />
                      <option value="クレジットカード" />
                    </datalist>
                  </label>
                </>
              )}
              <label>
                税表示
                <select value={doc.taxMode} onChange={(e) => set('taxMode', e.target.value as DocumentData['taxMode'])}>
                  <option value="exclusive">外税（単価は税抜）</option>
                  <option value="inclusive">内税（単価は税込）</option>
                </select>
              </label>
              <label>
                消費税の端数処理
                <select value={doc.rounding} onChange={(e) => set('rounding', e.target.value as DocumentData['rounding'])}>
                  <option value="floor">切り捨て</option>
                  <option value="round">四捨五入</option>
                  <option value="ceil">切り上げ</option>
                </select>
              </label>
            </div>
          </section>

          {info.supportsWithholding && (
            <section className="card">
              <h3>源泉徴収</h3>
              <div className="grid">
                <label className="checkbox span-2">
                  <input
                    type="checkbox"
                    checked={doc.withholdingEnabled}
                    onChange={(e) => set('withholdingEnabled', e.target.checked)}
                  />
                  源泉徴収税（所得税及び復興特別所得税）を差し引く
                </label>
                {doc.withholdingEnabled && (
                  <>
                    <label>
                      対象額
                      <select
                        value={doc.withholdingBaseMode}
                        onChange={(e) => set('withholdingBaseMode', e.target.value as DocumentData['withholdingBaseMode'])}
                      >
                        <option value="net">税抜金額（消費税を区分記載）</option>
                        <option value="gross">税込金額</option>
                      </select>
                    </label>
                    <div className="hint">
                      税率: 100万円以下の部分 10.21%、100万円超の部分 20.42%（1円未満切り捨て）。
                      <br />
                      交通費など対象外の明細は、明細の「源泉」のチェックを外してください。
                    </div>
                  </>
                )}
                {!doc.withholdingEnabled && doc.clientType === 'individual' && (
                  <div className="hint span-2">
                    個人へのデザイン料・原稿料・講演料・翻訳料・士業への報酬などは源泉徴収の対象になる場合があります。
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="card">
            <h3>明細</h3>
            <ItemsEditor
              items={doc.items}
              rounding={doc.rounding}
              showWithholding={info.supportsWithholding && doc.withholdingEnabled}
              onChange={(items) => set('items', items)}
            />
            <div className="totals-inline">
              <span>小計 ¥{totals.subtotal.toLocaleString('ja-JP')}</span>
              <span>消費税 ¥{totals.tax.toLocaleString('ja-JP')}</span>
              <strong>合計 ¥{totals.total.toLocaleString('ja-JP')}</strong>
            </div>
            {info.supportsWithholding && doc.withholdingEnabled && (
              <div className="totals-inline">
                <span>
                  源泉徴収税（対象 ¥{totals.withholdingBase.toLocaleString('ja-JP')}） −¥
                  {totals.withholdingTax.toLocaleString('ja-JP')}
                </span>
                <strong>差引支払額 ¥{totals.payable.toLocaleString('ja-JP')}</strong>
              </div>
            )}
          </section>

          <section className="card">
            <h3>その他</h3>
            <div className="grid">
              {doc.type === 'invoice' && (
                <label className="span-2">
                  お振込先
                  <textarea rows={3} value={doc.bankInfo} onChange={(e) => set('bankInfo', e.target.value)} />
                </label>
              )}
              <label className="span-2">
                備考
                <textarea rows={3} value={doc.notes} onChange={(e) => set('notes', e.target.value)} />
              </label>
            </div>
          </section>
        </div>

        {showPreview && (
          <div className="editor-preview">
            <div className="preview-scale">
              <DocumentPreview doc={previewDoc} company={settings} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
