import type { DocStatus, DocType } from '../types';

export interface DocTypeInfo {
  label: string;
  /** 宛先欄の見出し */
  recipientLabel: string;
  /** 金額欄の見出し */
  amountLabel: string;
  /** 本文の定型文 */
  lead: string;
  defaultPrefix: string;
  /** 源泉徴収税の差し引きに対応するか（発注書のみ） */
  supportsWithholding: boolean;
  /** URL のパス */
  path: string;
  /** 「入金済」「支払済」など。null は支払管理なし */
  paidLabel: string | null;
}

export const DOC_TYPES: Record<DocType, DocTypeInfo> = {
  invoice: {
    label: '請求書',
    recipientLabel: '請求先',
    amountLabel: 'ご請求金額',
    lead: '下記の通りご請求申し上げます。',
    defaultPrefix: 'INV',
    supportsWithholding: false,
    path: 'invoices',
    paidLabel: '入金済',
  },
  purchase_order: {
    label: '発注書',
    recipientLabel: '発注先',
    amountLabel: '発注金額',
    lead: '下記の通り発注いたします。',
    defaultPrefix: 'PO',
    supportsWithholding: true,
    path: 'purchase-orders',
    paidLabel: '支払済',
  },
  delivery_note: {
    label: '納品書',
    recipientLabel: '納品先',
    amountLabel: '納品金額',
    lead: '下記の通り納品いたします。',
    defaultPrefix: 'DN',
    supportsWithholding: false,
    path: 'delivery-notes',
    paidLabel: null,
  },
  receipt: {
    label: '領収書',
    recipientLabel: '宛名',
    amountLabel: '金額',
    lead: '上記正に領収いたしました。',
    defaultPrefix: 'RCP',
    supportsWithholding: false,
    path: 'receipts',
    paidLabel: null,
  },
};

export const CLIENT_TYPE_LABELS = { corporate: '法人', individual: '個人' } as const;

export const DOC_TYPE_ORDER: DocType[] = ['invoice', 'purchase_order', 'delivery_note', 'receipt'];

export const STATUS_LABELS: Record<DocStatus, string> = {
  draft: '下書き',
  issued: '発行済',
  paid: '入金済',
  cancelled: '取消',
};

/** 種別ごとに選べる状態（支払管理のない帳票には「入金済」などを出さない） */
export function statusesFor(type: DocType): DocStatus[] {
  return DOC_TYPES[type].paidLabel ? ['draft', 'issued', 'paid', 'cancelled'] : ['draft', 'issued', 'cancelled'];
}

export function statusLabel(type: DocType, status: DocStatus): string {
  if (status === 'paid') return DOC_TYPES[type].paidLabel ?? '完了';
  return STATUS_LABELS[status];
}

/** 源泉徴収税の支払（納付）状況のラベル */
export const WITHHOLDING_PAID_LABEL = '源泉支払済';

export const listPath = (t: DocType) => `/${DOC_TYPES[t].path}`;
export const newPath = (t: DocType, fromId?: string) =>
  `/${DOC_TYPES[t].path}/new${fromId ? `?from=${encodeURIComponent(fromId)}` : ''}`;
export const editPath = (t: DocType, id: string) => `/${DOC_TYPES[t].path}/${id}`;
export const printPath = (t: DocType, id: string) => `/${DOC_TYPES[t].path}/${id}/print`;

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && v in DOC_TYPES;
}

/** 収入印紙が必要となる金額（受取書・税抜記載時は税抜金額で判定） */
export const REVENUE_STAMP_THRESHOLD = 50000;
