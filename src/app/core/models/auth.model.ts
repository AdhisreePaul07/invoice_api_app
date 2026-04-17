import { ImageAsset } from './image.model';

export type TenantRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export interface UserSettings {
  contacts_list_limit?: number;
  accounts_list_limit?: number;
  invoices_list_limit?: number;
  deals_list_limit?: number;
  items_list_limit?: number;
  [key: string]: unknown;
}

export interface OrganizationSummary {
  id: number;
  uid: string;
  org_name: string;
  org_slug: string;
  is_active: boolean;
  is_provisioned: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember_me: boolean;
}

export interface LoginResponse {
  access: string;
  user: AccountProfile;
}

export interface AccountProfile {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  profile_image?: ImageAsset | null;
  tenant: OrganizationSummary | null;
  tenant_id: number | null;
  tenant_uid: string | null;
  tenant_role: TenantRole;
  is_email_verified: boolean;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  updated_at: string;
  user_settings?: UserSettings;
}

export interface UserSession {
  id: string;
  session_key: string;
  user_agent: string;
  ip_address: string | null;
  is_active: boolean;
  created_at: string;
  last_activity: string;
  expires_at: string | null;
  is_current: boolean;
}
