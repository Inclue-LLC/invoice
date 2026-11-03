import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { MAX_BANK_ACCOUNTS, bankAccountLabel, defaultBankAccount, newBankAccountId } from '../lib/bankAccounts';
import { DOC_TYPES, DOC_TYPE_ORDER } from '../lib/docTypes';
import { isValidRegistrationNumber } from '../lib/format';
import type { BankAccount, CompanySettings, DocType } from '../types';

/** 画像を最大 maxPx 四方に縮小し PNG の data URL にする（Firestore の1MB制限対策） */
function resizeImage(file: File, maxPx = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { settings, save, loading } = useSettings();
  const [form, setForm] = useState<CompanySettings>(settings);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  if (loading) return <div className="page"><p className="muted">読み込み中…</p></div>;

  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setPrefix = (t: DocType, v: string) => setForm((f) => ({ ...f, prefixes: { ...f.prefixes, [t]: v } }));
  const setNote = (t: DocType, v: string) => setForm((f) => ({ ...f, defaultNotes: { ...f.defaultNotes, [t]: v } }));

  const setAccount = (id: string, patch: Partial<BankAccount>) =>
    setForm((f) => ({ ...f, bankAccounts: f.bankAccounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const addAccount = () =>
    setForm((f) => ({ ...f, bankAccounts: [...f.bankAccounts, { id: newBankAccountId(), label: '', text: '' }] }));
  const removeAccount = (id: string) =>
    setForm((f) => {
      const bankAccounts = f.bankAccounts.filter((a) => a.id !== id);
      return {
        ...f,
        bankAccounts,
        defaultBankAccountId: f.defaultBankAccountId === id ? bankAccounts[0]?.id ?? '' : f.defaultBankAccountId,
      };
    });

  const regInvalid = form.registrationNumber !== '' && !isValidRegistrationNumber(form.registrationNumber);

  const submit = async () => {
    setMessage('');
    setError('');
    if (regInvalid) return setError('登録番号は「T」+13桁の数字で入力してください');
    // 既定の振込先が未入力なら、入力済みの最初の振込先を既定にする
    const def = defaultBankAccount(form);
    const toSave = def ? { ...form, defaultBankAccountId: def.id } : form;
    setSaving(true);
    try {
      await save(toSave);
      setMessage('保存しました');
    } catch (e) {
      setError(`保存に失敗しました: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onStamp = async (file: File | undefined) => {
    if (!file) return;
    try {
      set('stampImage', await resizeImage(file));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="page narrow">
      <div className="page-head">
        <h2>自社設定</h2>
        <div className="actions">
          <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
            保存
          </button>
        </div>
      </div>
      {message && <div className="alert alert-ok">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="card">
        <h3>自社情報（帳票の発行元）</h3>
        <div className="grid">
          <label className="span-2">
            会社名
            <input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label>
            郵便番号
            <input value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} />
          </label>
          <label>
            代表者・担当者
            <input value={form.representative} onChange={(e) => set('representative', e.target.value)} />
          </label>
          <label className="span-2">
            住所
            <textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </label>
          <label>
            電話番号
            <input value={form.tel} onChange={(e) => set('tel', e.target.value)} />
          </label>
          <label>
            FAX
            <input value={form.fax} onChange={(e) => set('fax', e.target.value)} />
          </label>
          <label>
            メール
            <input value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label>
            適格請求書発行事業者 登録番号
            <input
              className={regInvalid ? 'invalid' : ''}
              value={form.registrationNumber}
              placeholder="T1234567890123"
              onChange={(e) => set('registrationNumber', e.target.value.trim().toUpperCase())}
            />
          </label>
          <div className="span-2 stamp-field">
            <div>社印（角印）画像</div>
            <div className="stamp-row">
              {form.stampImage ? <img src={form.stampImage} alt="社印" className="stamp-thumb" /> : <span className="muted">未設定</span>}
              <input type="file" accept="image/png,image/jpeg" onChange={(e) => void onStamp(e.target.files?.[0])} />
              {form.stampImage && (
                <button className="btn btn-sm" onClick={() => set('stampImage', '')}>
                  削除
                </button>
              )}
            </div>
            <div className="muted small">背景が透明な PNG を推奨します。</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>請求書の初期値</h3>
        <div className="grid">
          <div className="span-2 bank-accounts">
            <div className="bank-accounts-head">
              <span>お振込先</span>
              <span className="muted small">請求書の作成時に選べます。「既定」にした振込先が最初から選ばれます。</span>
            </div>
            {form.bankAccounts.map((a, i) => (
              <div className="bank-account" key={a.id}>
                <div className="bank-account-top">
                  <label className="radio">
                    <input
                      type="radio"
                      name="defaultBank"
                      checked={form.defaultBankAccountId === a.id}
                      onChange={() => set('defaultBankAccountId', a.id)}
                    />
                    既定
                  </label>
                  <input
                    className="bank-label"
                    value={a.label}
                    placeholder={`名称（例: 三井住友銀行）※空欄なら「振込先${i + 1}」`}
                    onChange={(e) => setAccount(a.id, { label: e.target.value })}
                    aria-label={`振込先${i + 1}の名称`}
                  />
                  {form.bankAccounts.length > 1 && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeAccount(a.id)}>
                      削除
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={a.text}
                  aria-label={`${bankAccountLabel(a, i)}の内容`}
                  placeholder={'○○銀行 △△支店（123）\n普通 1234567\n口座名義 ゴウドウガイシャインクルー'}
                  onChange={(e) => setAccount(a.id, { text: e.target.value })}
                />
              </div>
            ))}
            {form.bankAccounts.length < MAX_BANK_ACCOUNTS && (
              <button type="button" className="btn btn-sm" onClick={addAccount}>
                ＋ 振込先を追加
              </button>
            )}
          </div>
          <label>
            お支払期限
            <select value={form.invoiceDueDays} onChange={(e) => set('invoiceDueDays', Number(e.target.value))}>
              <option value={0}>翌月末</option>
              <option value={7}>発行日から7日後</option>
              <option value={14}>発行日から14日後</option>
              <option value={30}>発行日から30日後</option>
              <option value={60}>発行日から60日後</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h3>計算の初期値</h3>
        <div className="grid">
          <label>
            税表示
            <select value={form.defaultTaxMode} onChange={(e) => set('defaultTaxMode', e.target.value as CompanySettings['defaultTaxMode'])}>
              <option value="exclusive">外税（単価は税抜）</option>
              <option value="inclusive">内税（単価は税込）</option>
            </select>
          </label>
          <label>
            消費税の端数処理
            <select value={form.defaultRounding} onChange={(e) => set('defaultRounding', e.target.value as CompanySettings['defaultRounding'])}>
              <option value="floor">切り捨て</option>
              <option value="round">四捨五入</option>
              <option value="ceil">切り上げ</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h3>帳票ごとの設定</h3>
        <table className="table">
          <thead>
            <tr>
              <th>種別</th>
              <th style={{ width: 140 }}>番号プレフィックス</th>
              <th>備考の初期値</th>
            </tr>
          </thead>
          <tbody>
            {DOC_TYPE_ORDER.map((t) => (
              <tr key={t}>
                <td>{DOC_TYPES[t].label}</td>
                <td>
                  <input value={form.prefixes[t]} onChange={(e) => setPrefix(t, e.target.value)} />
                  <div className="muted small">例: {form.prefixes[t] ? `${form.prefixes[t]}-` : ''}2026-0001</div>
                </td>
                <td>
                  <textarea rows={2} value={form.defaultNotes[t]} onChange={(e) => setNote(t, e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
