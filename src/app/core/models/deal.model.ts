import { AccountProfile } from './auth.model';
import { AccountRef } from './contact.model';

export interface DealContactRef {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  primary_phone: string;
  designation: string;
}

export interface Deal {
  id?: number;
  deal_name: string;
  deal_value: string | number;
  deal_status: number;
  start_date: string | null;
  expected_close_date: string | null;
  actual_close_date: string | null;
  description: string;
  account: number | null;
  contact: number | null;
  account_ids?: number[];
  contact_ids?: number[];
  account_details?: AccountRef[];
  contact_details?: DealContactRef[];
  linked_invoice_ids?: number[];
  is_active?: boolean;
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
  showMenu?: boolean;
}

export interface DealListResponse {
  code: number;
  count: number;
  limit?: number;
  page?: number;
  total_pages?: number;
  list: Deal[];
}
