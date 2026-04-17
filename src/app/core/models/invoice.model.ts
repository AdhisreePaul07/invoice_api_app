import { AccountProfile } from './auth.model';
import { Item } from './item.model';

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  item_catalog_id?: number | null;
  item_catalog?: Item | null;
  item_name: string;
  item_code: string;
  item_details: string;
  quantity: string | number;
  unit_price: string | number;
  currency_code: string;
  tax_value: string | number;
  item_cgst: string | number;
  item_sgst: string | number;
  item_igst: string | number;
  line_total?: string | number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceSnapshot {
  [key: string]: unknown;
}

export interface Invoice {
  id?: number;
  invoice_no: string;
  invoice_date: string;
  due_date?: string | null;
  invoice_status: number;
  invoice_type: number;
  invoice_header: Record<string, unknown>;
  invoice_footer: Record<string, unknown>;
  invoice_terms: Array<string | Record<string, unknown>>;
  invoice_desc: Record<string, unknown>;
  exchange_rate_data: Record<string, unknown>;
  sub_total?: string | number;
  total_cgst?: string | number;
  total_sgst?: string | number;
  total_igst?: string | number;
  discount?: string | number;
  adjustment?: string | number;
  total?: string | number;
  amount_paid?: string | number;
  balance_due?: string | number;
  account: number | null;
  contact: number | null;
  deal: number | null;
  organization: number | null;
  account_snapshot?: InvoiceSnapshot;
  contact_snapshot?: InvoiceSnapshot;
  deal_snapshot?: InvoiceSnapshot;
  organization_snapshot?: InvoiceSnapshot;
  public_share_token?: string;
  public_share_enabled?: boolean;
  public_share_created_at?: string | null;
  public_share_expires_at?: string | null;
  public_share_is_expired?: boolean;
  pdf_file?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  is_active?: boolean;
  invoice_items: InvoiceItem[];
  share_public_url?: string | null;
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
  showMenu?: boolean;
}

export interface InvoiceListResponse {
  code: number;
  count: number;
  limit?: number;
  page?: number;
  total_pages?: number;
  list: Invoice[];
}
