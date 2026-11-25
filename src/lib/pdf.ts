/**
 * 帳票（A4 の .sheet 要素）を PDF にしてダウンロードする。
 * 画面の表示をそのまま高解像度の画像にして A4 に貼るため、日本語フォントや社印も見た目どおりになる。
 * 1 ページに収まらない場合は A4 ごとに分割する。
 * html2canvas / jsPDF は大きいので、ボタンを押したときだけ読み込む。
 */

const A4_W_MM = 210;
const A4_H_MM = 297;
const PAGE_MARGIN_MM = 12;

/** ファイル名に使えない文字を除く */
export function pdfFileName(parts: string[]): string {
  const name = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('_')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_');
  return `${name || 'document'}.pdf`;
}

export async function downloadSheetPdf(el: HTMLElement, fileName: string): Promise<void> {
  await document.fonts.ready;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const canvas = await html2canvas(el, {
    scale: 2.5,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    // 画面の拡大縮小やスクロール位置に左右されないようにする
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: document.documentElement.scrollWidth,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pxPerMm = canvas.width / A4_W_MM;
  const pagePx = Math.floor(A4_H_MM * pxPerMm);
  // 2ページ目以降の上下の余白
  const marginPx = Math.round(PAGE_MARGIN_MM * pxPerMm);
  // 端数（2mm 未満）だけの白紙ページは作らない
  const tolerancePx = 2 * pxPerMm;

  // 改ページしてよい位置（表の行や枠の下端）。行の途中でページが分かれないようにする
  const rect = el.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const breaks = [...el.querySelectorAll('tr, .pv-head, .pv-parties, .pv-summary, .pv-box, .pv-notes')]
    .map((n) => Math.round((n.getBoundingClientRect().bottom - rect.top) * scale))
    .sort((a, b) => a - b);

  let y = 0;
  for (let page = 0; canvas.height - y > tolerancePx; page++) {
    const offsetTop = page === 0 ? 0 : marginPx;
    let end: number;
    if (canvas.height - y <= pagePx - offsetTop + tolerancePx) {
      end = canvas.height; // 残りがこのページに収まる
    } else {
      const limit = y + pagePx - offsetTop - marginPx;
      const candidate = breaks.filter((b) => b > y + marginPx && b <= limit).pop();
      end = candidate ?? limit;
    }
    const h = Math.min(end, canvas.height) - y;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, offsetTop / pxPerMm, A4_W_MM, h / pxPerMm, undefined, 'FAST');
    y += h;
  }

  pdf.setProperties({ title: fileName.replace(/\.pdf$/, '') });
  // jsPDF の save() はブラウザによってファイル名が付かないことがあるため、自分でダウンロードする
  const url = URL.createObjectURL(pdf.output('blob'));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
