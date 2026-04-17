import { AccountProfile } from './auth.model';

export interface Receipt {
  id?: number;
  receipt_no: string;
  receipt_date: string;
  payment_date?: string | null;
  invoice: number | null;
  invoice_snapshot?: Record<string, unknown>;
  exchange_rate_data: Record<string, unknown>;
  amount_received: string | number;
  payment_method: number;
  transaction_ref?: string;
  receipt_status: number;
  receipt_notes?: string;
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
}
