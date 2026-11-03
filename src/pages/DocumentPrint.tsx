import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DocumentPreview from '../components/DocumentPreview';
import { useSettings } from '../contexts/SettingsContext';
import { DOC_TYPES } from '../lib/docTypes';
import { getDocument } from '../services/documents';
import type { StoredDocument } from '../types';

export default function DocumentPrint() {
  const { id } = useParams();
  const { settings, loading } = useSettings();
  const [doc, setDoc] = useState<StoredDocument | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getDocument(id)
      .then((d) => (d ? setDoc(d) : setError('帳票が見つかりません')))
      .catch((e) => setError(String(e)));
  }, [id]);

  // 「PDFに保存」時のファイル名になる
  useEffect(() => {
    if (!doc) return;
    const prev = document.title;
    document.title = `${DOC_TYPES[doc.type].label}_${doc.number}_${doc.clientName}`;
    return () => {
      document.title = prev;
    };
  }, [doc]);

  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!doc || loading) return <div className="page"><p className="muted">読み込み中…</p></div>;

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Link className="btn" to="/">
          ← 一覧
        </Link>
        <Link className="btn" to={`/documents/${doc.id}`}>
          編集
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          印刷 / PDFで保存
        </button>
        <span className="muted small">印刷ダイアログで送信先を「PDFに保存」にするとPDFを作成できます（用紙A4・余白なし推奨）</span>
      </div>
      {doc.status === 'cancelled' && <div className="alert alert-error no-print">この帳票は取消済みです。</div>}
      <div className="print-area">
        <DocumentPreview doc={doc} company={settings} />
      </div>
    </div>
  );
}
