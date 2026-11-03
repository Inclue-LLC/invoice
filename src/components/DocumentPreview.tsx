import { DOC_TYPES, REVENUE_STAMP_THRESHOLD } from '../lib/docTypes';
import { lineAmount } from '../lib/calc';
import { formatDateJa, formatNumber, formatYen } from '../lib/format';
import type { CompanySettings, DocumentData } from '../types';

interface Props {
  doc: DocumentData;
  company: CompanySettings;
}

const MIN_ROWS = 10;

export default function DocumentPreview({ doc, company }: Props) {
  const info = DOC_TYPES[doc.type];
  const { totals } = doc;
  const isReceipt = doc.type === 'receipt';
  const hasReducedRate = doc.items.some((i) => i.taxRate === 8);
  const emptyRows = Math.max(0, MIN_ROWS - doc.items.length);
  // 収入印紙: 消費税額が区分記載されている場合は税抜金額で判定
  const needsStamp =
    isReceipt && totals.subtotal >= REVENUE_STAMP_THRESHOLD && !/クレジット|カード/.test(doc.paymentMethod);

  const recipient = (
    <div className="pv-recipient">
      {doc.clientPostalCode && <div className="pv-small">〒{doc.clientPostalCode}</div>}
      {doc.clientAddress && <div className="pv-small pv-pre">{doc.clientAddress}</div>}
      <div className="pv-client-name">
        {doc.clientName || '　'}
        <span className="pv-honorific">{doc.clientHonorific}</span>
      </div>
    </div>
  );

  const issuer = (
    <div className="pv-issuer">
      <div className="pv-company-name">{company.name}</div>
      {company.postalCode && <div>〒{company.postalCode}</div>}
      {company.address && <div className="pv-pre">{company.address}</div>}
      {(company.tel || company.fax) && (
        <div>
          {company.tel && `TEL: ${company.tel}`}
          {company.tel && company.fax && '　'}
          {company.fax && `FAX: ${company.fax}`}
        </div>
      )}
      {company.email && <div>{company.email}</div>}
      {company.representative && <div>担当: {company.representative}</div>}
      {company.registrationNumber && <div>登録番号: {company.registrationNumber}</div>}
      {company.stampImage && <img className="pv-stamp" src={company.stampImage} alt="社印" />}
    </div>
  );

  const meta = (
    <table className="pv-meta">
      <tbody>
        <tr>
          <th>No.</th>
          <td>{doc.number}</td>
        </tr>
        <tr>
          <th>{isReceipt ? '領収日' : '発行日'}</th>
          <td>{formatDateJa(doc.issueDate)}</td>
        </tr>
      </tbody>
    </table>
  );

  const rateTable = (
    <table className="pv-rates">
      <thead>
        <tr>
          <th>税率</th>
          <th>{doc.taxMode === 'exclusive' ? '税抜金額' : '税込金額'}</th>
          <th>消費税額</th>
        </tr>
      </thead>
      <tbody>
        {totals.byRate.map((r) => (
          <tr key={r.rate}>
            <td>{r.rate === 0 ? '対象外' : `${r.rate}%${r.rate === 8 ? '（軽減）' : ''}対象`}</td>
            <td className="num">{formatYen(doc.taxMode === 'exclusive' ? r.net : r.gross)}</td>
            <td className="num">{formatYen(r.tax)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (isReceipt) {
    return (
      <div className="sheet">
        <div className="pv-head">
          <h1 className="pv-title pv-title-receipt">{info.label}</h1>
          {meta}
        </div>
        {recipient}
        <div className="pv-receipt-amount">
          <span className="pv-label">{info.amountLabel}</span>
          <span className="pv-value">{formatYen(totals.total)}-</span>
          <span className="pv-sub">（税込）</span>
        </div>
        <div className="pv-receipt-purpose">但し {doc.receiptPurpose || '　'} として</div>
        <div className="pv-lead">{info.lead}</div>
        <div className="pv-receipt-bottom">
          <div>
            {rateTable}
            {doc.paymentMethod && <div className="pv-small">お支払方法: {doc.paymentMethod}</div>}
            {doc.subject && <div className="pv-small">件名: {doc.subject}</div>}
          </div>
          {needsStamp && <div className="pv-revenue-stamp">収入<br />印紙</div>}
          {issuer}
        </div>
        {doc.notes && <div className="pv-notes pv-pre">{doc.notes}</div>}
      </div>
    );
  }

  return (
    <div className="sheet">
      <div className="pv-head">
        <h1 className="pv-title">{info.label}</h1>
        {meta}
      </div>
      <div className="pv-parties">
        <div>
          {recipient}
          {doc.subject && (
            <div className="pv-subject">
              <span>件名</span>
              {doc.subject}
            </div>
          )}
          <div className="pv-lead">{info.lead}</div>
          <div className="pv-amount">
            <span className="pv-label">{info.amountLabel}</span>
            <span className="pv-value">{formatYen(totals.total)}</span>
            <span className="pv-sub">（税込）</span>
          </div>
          <table className="pv-conditions">
            <tbody>
              {doc.type === 'invoice' && doc.dueDate && (
                <tr>
                  <th>お支払期限</th>
                  <td>{formatDateJa(doc.dueDate)}</td>
                </tr>
              )}
              {doc.type === 'purchase_order' && doc.deliveryDate && (
                <tr>
                  <th>納期</th>
                  <td>{formatDateJa(doc.deliveryDate)}</td>
                </tr>
              )}
              {doc.type === 'delivery_note' && doc.deliveryDate && (
                <tr>
                  <th>納品日</th>
                  <td>{formatDateJa(doc.deliveryDate)}</td>
                </tr>
              )}
              {doc.type === 'purchase_order' && doc.deliveryPlace && (
                <tr>
                  <th>納品場所</th>
                  <td>{doc.deliveryPlace}</td>
                </tr>
              )}
              {doc.type === 'purchase_order' && doc.paymentTerms && (
                <tr>
                  <th>支払条件</th>
                  <td>{doc.paymentTerms}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {issuer}
      </div>

      <table className="pv-items">
        <thead>
          <tr>
            <th className="col-name">品名・内容</th>
            <th className="col-qty">数量</th>
            <th className="col-unit">単位</th>
            <th className="col-price">単価</th>
            <th className="col-amount">金額</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it) => (
            <tr key={it.id}>
              <td>
                {it.name}
                {it.taxRate === 8 && <span className="pv-mark"> ※</span>}
                {it.taxRate === 0 && <span className="pv-mark"> （対象外）</span>}
              </td>
              <td className="num">{formatNumber(it.quantity)}</td>
              <td className="center">{it.unit}</td>
              <td className="num">{formatNumber(it.unitPrice)}</td>
              <td className="num">{formatNumber(lineAmount(it, doc.rounding))}</td>
            </tr>
          ))}
          {Array.from({ length: emptyRows }, (_, i) => (
            <tr key={`empty-${i}`} className="pv-empty">
              <td>&nbsp;</td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pv-summary">
        <div className="pv-summary-left">
          {rateTable}
          {hasReducedRate && <div className="pv-small">※印は軽減税率（8%）対象品目です。</div>}
          {doc.taxMode === 'inclusive' && <div className="pv-small">単価・金額は税込表示です。</div>}
        </div>
        <table className="pv-totals">
          <tbody>
            <tr>
              <th>小計（税抜）</th>
              <td className="num">{formatYen(totals.subtotal)}</td>
            </tr>
            <tr>
              <th>消費税</th>
              <td className="num">{formatYen(totals.tax)}</td>
            </tr>
            <tr className="pv-grand">
              <th>合計（税込）</th>
              <td className="num">{formatYen(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {doc.type === 'invoice' && doc.bankInfo && (
        <div className="pv-box">
          <div className="pv-box-title">お振込先</div>
          <div className="pv-pre">{doc.bankInfo}</div>
        </div>
      )}
      {doc.notes && (
        <div className="pv-box">
          <div className="pv-box-title">備考</div>
          <div className="pv-pre">{doc.notes}</div>
        </div>
      )}
    </div>
  );
}
