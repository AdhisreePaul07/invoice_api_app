import { AccountProfile } from './auth.model';
import { ImageAsset } from './image.model';

export interface TypeValuePair {
  type: string;
  value: string;
}

export interface Address {
  Country?: string;
  country?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  City?: string;
  county?: string;
  state?: string;
  pin_code?: string;
  [key: string]: unknown;
}

export interface CurrencyOption {
  id?: number | null;
  name: string;
  shortname: string;
  symbol: string;
}

export interface CurrencySettings {
  currencies?: CurrencyOption[];
  default_currency?: string;
  base_currency?: string;
  currency_symbol?: string;
  [key: string]: unknown;
}

export interface InvoiceSettings {
  invoice_prefix?: string;
  receipt_prefix?: string;
  invoice_number_start?: number | string | null;
  receipt_number_start?: number | string | null;
  receipt_due_id?: number | null;
  receipt_due_days?: number | null;
  receipt_due_label?: string;
  default_terms?: string;
  default_footer?: string;
  default_footer_notes?: string;
  default_header?: string;
  default_header_notes?: string;
  default_description?: string;
  [key: string]: unknown;
}

export interface Organization {
  id?: number;
  uid?: string;
  org_name: string;
  org_slug?: string;
  schema_name?: string;
  plan_code?: string;
  legal_identifiers: TypeValuePair[];
  tax_detail: TypeValuePair[];
  primary_address: Address;
  all_address: Address[];
  profile_image?: ImageAsset | null;
  company_logo?: ImageAsset | null;
  company_stamp?: ImageAsset | null;
  brand_settings: Record<string, unknown>;
  invoice_settings: InvoiceSettings;
  currency_settings: CurrencySettings;
  is_active?: boolean;
  is_provisioned?: boolean;
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
}

export interface OrgListResponse {
  code: number;
  count: number;
  list: Organization[];
}
