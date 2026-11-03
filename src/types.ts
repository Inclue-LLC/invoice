export type DocType = 'invoice' | 'purchase_order' | 'delivery_note' | 'receipt';
export type DocStatus = 'draft' | 'issued' | 'paid' | 'cancelled';
export type TaxRate = 10 | 8 | 0;
/** exclusive: 外税（単価は税抜） / inclusive: 内税（単価は税込） */
export type TaxMode = 'exclusive' | 'inclusive';
export type Rounding = 'floor' | 'round' | 'ceil';
export type Honorific = '御中' | '様' | '';
/** 取引先区分 */
export type ClientType = 'corporate' | 'individual';
/** 源泉徴収の対象額: net = 税抜金額 / gross = 税込金額 */
export type WithholdingBaseMode = 'net' | 'gross';

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: TaxRate;
  /** 源泉徴収の対象とするか（未設定は対象） */
  withholding?: boolean;
}

export interface WithholdingOptions {
  enabled: boolean;
  baseMode: WithholdingBaseMode;
}

export interface RateBreakdown {
  rate: TaxRate;
  /** 税抜金額 */
  net: number;
  /** 消費税額 */
  tax: number;
  /** 税込金額 */
  gross: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
  byRate: RateBreakdown[];
  /** 源泉徴収の対象額 */
  withholdingBase: number;
  /** 源泉徴収税額（所得税及び復興特別所得税） */
  withholdingTax: number;
  /** 差引支払額（合計 − 源泉徴収税額） */
  payable: number;
}

export interface DocumentData {
  type: DocType;
  number: string;
  status: DocStatus;
  issueDate: string; // YYYY-MM-DD
  clientId: string | null;
  clientType: ClientType;
  clientName: string;
  clientHonorific: Honorific;
  clientPostalCode: string;
  clientAddress: string;
  subject: string;
  items: LineItem[];
  notes: string;
  taxMode: TaxMode;
  rounding: Rounding;
  /** 源泉徴収税を差し引くか */
  withholdingEnabled: boolean;
  withholdingBaseMode: WithholdingBaseMode;
  totals: Totals;
  /** 請求書: お支払期限 */
  dueDate: string;
  /** 請求書: 振込先 */
  bankInfo: string;
  /** 発注書 / 納品書: 納期・納品日 */
  deliveryDate: string;
  /** 発注書: 納品場所 */
  deliveryPlace: string;
  /** 発注書: 支払条件 */
  paymentTerms: string;
  /** 領収書: 但し書き */
  receiptPurpose: string;
  /** 領収書: 支払方法 */
  paymentMethod: string;
  /** 請求書: 入金日 / 発注書: 支払日（YYYY-MM-DD、未払いは空） */
  paidDate: string;
  /** 発注書: 源泉徴収税の支払（納付）日（YYYY-MM-DD、未払いは空） */
  withholdingPaidDate: string;
  /** 変換元の帳票ID */
  sourceDocId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StoredDocument extends DocumentData {
  id: string;
}

export interface Client {
  id: string;
  type: ClientType;
  name: string;
  honorific: Honorific;
  postalCode: string;
  address: string;
  department: string;
  contactName: string;
  tel: string;
  email: string;
  memo: string;
  /** 源泉徴収の対象（個人への報酬・料金など） */
  withholding: boolean;
}

export interface CompanySettings {
  name: string;
  postalCode: string;
  address: string;
  tel: string;
  fax: string;
  email: string;
  representative: string;
  /** 適格請求書発行事業者 登録番号（T + 13桁） */
  registrationNumber: string;
  bankInfo: string;
  /** 社印画像（data URL） */
  stampImage: string;
  defaultTaxMode: TaxMode;
  defaultRounding: Rounding;
  /** 帳票種別ごとの番号プレフィックス */
  prefixes: Record<DocType, string>;
  /** 帳票種別ごとの備考初期値 */
  defaultNotes: Record<DocType, string>;
  /** 請求書の支払期限（発行日からの日数, 0 = 翌月末） */
  invoiceDueDays: number;
}
