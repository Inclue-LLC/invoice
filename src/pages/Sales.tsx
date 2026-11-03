import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SalesSummary from '../components/SalesSummary';
import { listPath } from '../lib/docTypes';
import { listDocumentsByType } from '../services/documents';
import type { StoredDocument } from '../types';

/** 売上管理（請求書の発行額・入金済・未入金を月別／年別に集計） */
export default function Sales() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listDocumentsByType('invoice')
      .then(setInvoices)
      .catch((e) => setError(`読み込みに失敗しました: ${String(e)}`))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <h2>売上管理</h2>
        <div className="actions">
          <Link className="btn btn-lg" to={`${listPath('invoice')}?status=unpaid`}>
            未入金の請求書を見る
          </Link>
          <Link className="btn btn-primary btn-lg" to={listPath('invoice')}>
            請求書一覧へ
          </Link>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : (
        !error && (
          <SalesSummary
            invoices={invoices}
            onSelectMonth={(m) => m && navigate(`${listPath('invoice')}?month=${m}`)}
          />
        )
      )}
    </div>
  );
}
