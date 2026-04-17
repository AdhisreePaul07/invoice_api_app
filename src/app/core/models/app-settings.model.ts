import { TenantMediaAsset } from './image.model';

export interface AppSettingRow {
  id: number;
  setting_name: string;
  setting_value: unknown;
}

export interface InvoiceNumberAppSetting {
  invoice_prefix?: string;
  invoice_suffix?: string;
  next_number?: string;
  [key: string]: unknown;
}

export interface ReceiptNumberAppSetting {
  receipt_prefix?: string;
  receipt_suffix?: string;
  next_number?: string;
  [key: string]: unknown;
}

export interface TextAppSetting {
  data?: string;
  [key: string]: unknown;
}

export interface ReceiptNotesAppSetting extends TextAppSetting {}

export type InvoiceTemplateBlockType =
  | 'text'
  | 'hero'
  | 'seller'
  | 'billTo'
  | 'invoiceMeta'
  | 'itemsTable'
  | 'totals'
  | 'notes'
  | 'terms'
  | 'footer';

export interface InvoiceTemplateBlock {
  id: string;
  type: InvoiceTemplateBlockType;
  label: string;
  heading?: string;
  description?: string;
  enabled?: boolean;
  layout?: 'full' | 'split';
  alignment?: 'start' | 'center' | 'end';
  padding?: number;
  backgroundColor?: string;
  textColor?: string;
  surfaceStyle?: 'plain' | 'card' | 'outline';
  content?: string;
  fontSize?: number;
  width?: number;
  autoWidth?: boolean;
  [key: string]: unknown;
}

export interface InvoiceTemplateDesign {
  paperSize?: 'A4';
  fontFamily?: string;
  accentColor?: string;
  pageStyle?: string;
  blocks?: InvoiceTemplateBlock[];
  [key: string]: unknown;
}

export interface InvoiceTemplateAppSetting extends Record<string, unknown> {
  id?: string;
  temp_name?: string;
  description?: string;
  is_default?: boolean;
  design?: InvoiceTemplateDesign;
}

export interface AppSettingsMap {
  invoice_number?: InvoiceNumberAppSetting;
  receipt_number?: ReceiptNumberAppSetting;
  receipt_notes?: ReceiptNotesAppSetting;
  invoice_template?: InvoiceTemplateAppSetting[];
  invoice_header?: TextAppSetting;
  invoice_footer?: TextAppSetting;
  invoice_description?: TextAppSetting;
  invoice_terms?: TextAppSetting;
  [key: string]: unknown;
}

export interface AppSettingsAssetsPayload {
  count: number;
  list: TenantMediaAsset[];
  grouped: Partial<Record<TenantMediaAsset['asset_type'], TenantMediaAsset[]>>;
}

export interface AppSettingsResponse {
  code: number;
  count: number;
  list: AppSettingRow[];
  settings: AppSettingsMap;
  assets?: AppSettingsAssetsPayload;
  message?: string;
}
