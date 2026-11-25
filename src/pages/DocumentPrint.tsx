import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DocumentPreview from '../components/DocumentPreview';
import { useSettings } from '../contexts/SettingsContext';
import { DOC_TYPES, editPath, listPath } from '../lib/docTypes';
import { downloadSheetPdf, pdfFileName } from '../lib/pdf';
import { getDocument } from '../services/documents';
import type { DocType, StoredDocument } from '../types';

export default function DocumentPrint({ type }: { type: DocType }) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { settings, loading } = useSettings();
  const [doc, setDoc] = useState<StoredDocument | null>(null);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getDocument(id)
      .then((d) => (d ? setDoc(d) : setError('帳票が見つかりません')))
      .catch((e) => setError(String(e)));
  }, [id]);

  const baseName = doc ? [DOC_TYPES[doc.type].label, doc.number, doc.clientName] : [];

  // ブラウザの印刷ダイアログで「PDFに保存」したときのファイル名にもなる
  useEffect(() => {
    if (!doc) return;
    const prev = document.title;
    document.title = baseName.join('_');
    return () => {
      document.title = prev;
    };
  }, [doc]);

  const print = () => {
    // Web フォントの読み込みを待ってから印刷する
    void document.fonts.ready.then(() => window.print());
  };

  const downloadPdf = async () => {
    const el = sheetRef.current?.querySelector<HTMLElement>('.sheet');
    if (!el || !doc) return;
    setPdfBusy(true);
    setError('');
    try {
      await downloadSheetPdf(el, pdfFileName(baseName));
    } catch (e) {
      setError(`PDFの作成に失敗しました: ${String(e)}`);
    } finally {
      setPdfBusy(false);
    }
  };

  // 編集画面・一覧の「印刷」「PDF」ボタンから開かれたときは、そのまま実行する（1回だけ）
  const action = params.get('action');
  const actionDone = useRef(false);
  useEffect(() => {
    if (!doc || loading || !action || actionDone.current) return;
    actionDone.current = true;
    // 表示が描画されてから実行し、そのあと URL から ?action= を消す（再読み込みで繰り返さないように）
    window.setTimeout(() => {
      if (action === 'pdf') void downloadPdf();
      else if (action === 'print') print();
      setParams({}, { replace: true });
    }, 300);
  }, [doc, loading, action]);

  if (error && !doc) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!doc || loading) return <div className="page"><p className="muted">読み込み中…</p></div>;

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Link className="btn" to={listPath(type)}>
          ← {DOC_TYPES[type].label}一覧
        </Link>
        <Link className="btn" to={editPath(doc.type, doc.id)}>
          編集
        </Link>
        <span className="toolbar-gap" />
        <button className="btn btn-lg" onClick={print}>
          🖨 印刷
        </button>
        <button className="btn btn-primary btn-lg" onClick={() => void downloadPdf()} disabled={pdfBusy}>
          {pdfBusy ? 'PDFを作成中…' : '⬇ PDFをダウンロード'}
        </button>
      </div>
      {error && <div className="alert alert-error no-print print-toolbar-alert">{error}</div>}
      {doc.status === 'cancelled' && <div className="alert alert-error no-print print-toolbar-alert">この帳票は取消済みです。</div>}
      <div className="print-area" ref={sheetRef}>
        <DocumentPreview doc={doc} company={settings} />
      </div>
    </div>
  );
}
