import { AccountProfile } from './auth.model';

export interface Item {
  id?: number;
  item_name: string;
  item_code: string;
  item_details?: string;
  default_unit_price: string | number;
  default_tax_value: string | number;
  currency_code: string;
  is_active?: boolean;
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
  showMenu?: boolean;
}

export interface ItemListResponse {
  code: number;
  count: number;
  limit?: number;
  page?: number;
  total_pages?: number;
  list: Item[];
}
