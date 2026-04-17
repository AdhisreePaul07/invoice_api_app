import { AccountProfile } from './auth.model';
import { ImageAsset } from './image.model';

export interface AccountRef {
  id: number;
  account_name: string;
  profile_image?: ImageAsset | null;
}

export interface Contact {
  id?: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  secondary_emails: string[];
  primary_phone: string;
  secondary_phones: string[];
  profile_image?: ImageAsset | null;
  designation: string;
  notes: string;
  is_active?: boolean;
  account_ids?: number[];
  account_details?: AccountRef[];
  created_by?: AccountProfile;
  created_at?: string;
  updated_at?: string;
  showMenu?: boolean;
}

export interface ContactListResponse {
  code: number;
  count: number;
  limit?: number;
  page?: number;
  total_pages?: number;
  list: Contact[];
}
