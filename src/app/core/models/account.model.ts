import { AccountProfile } from './auth.model';
import { ImageAsset } from './image.model';
import { Address, CurrencyOption, TypeValuePair } from './organization.model';

export interface ContactMini {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  primary_phone: string;
  designation: string;
  profile_image?: ImageAsset | null;
}

export interface Account {
  id?: number;
  account_name: string;
  account_type: number;
  legal_identifiers: TypeValuePair[];
  tax_model: string;
  tax_detail: TypeValuePair[];
  primary_address: Address;
  all_address: Address[];
  profile_image?: ImageAsset | null;
  currencies: CurrencyOption[];
  tax_type: Record<string, unknown>[];
  notes: string;
  is_active?: boolean;
  contact_ids?: number[];
  contact_details?: ContactMini[];
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
  showMenu?: boolean;
}

export interface AccountListResponse {
  code: number;
  count: number;
  limit?: number;
  page?: number;
  total_pages?: number;
  list: Account[];
}
