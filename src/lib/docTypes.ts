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
}

export const DOC_TYPES: Record<DocType, DocTypeInfo> = {
  invoice: {
    label: '請求書',
    recipientLabel: '請求先',
    amountLabel: 'ご請求金額',
    lead: '下記の通りご請求申し上げます。',
    defaultPrefix: 'INV',
    supportsWithholding: false,
  },
  purchase_order: {
    label: '発注書',
    recipientLabel: '発注先',
    amountLabel: '発注金額',
    lead: '下記の通り発注いたします。',
    defaultPrefix: 'PO',
    supportsWithholding: true,
  },
  delivery_note: {
    label: '納品書',
    recipientLabel: '納品先',
    amountLabel: '納品金額',
    lead: '下記の通り納品いたします。',
    defaultPrefix: 'DN',
    supportsWithholding: false,
  },
  receipt: {
    label: '領収書',
    recipientLabel: '宛名',
    amountLabel: '金額',
    lead: '上記正に領収いたしました。',
    defaultPrefix: 'RCP',
    supportsWithholding: false,
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

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && v in DOC_TYPES;
}

/** 収入印紙が必要となる金額（受取書・税抜記載時は税抜金額で判定） */
export const REVENUE_STAMP_THRESHOLD = 50000;
