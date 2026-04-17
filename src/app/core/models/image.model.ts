export interface ImageAsset {
  storage_backend?: string;
  bucket?: string;
  path?: string;
  original_name?: string;
  content_type?: string;
  size?: number;
  extension?: string;
  uploaded_at?: string;
  url?: string | null;
}

export type TenantAssetType =
  | 'invoice_background'
  | 'invoice_template_background'
  | 'invoice_template_asset'
  | 'tenant_branding';

export interface TenantMediaAsset {
  id: number;
  asset_type: TenantAssetType;
  asset_key: string;
  title: string;
  file: ImageAsset;
  extra_meta: Record<string, unknown>;
  uploaded_by?: number | null;
  uploaded_by_email?: string;
  created_at: string;
  updated_at: string;
}

export interface TenantMediaAssetListResponse {
  code: number;
  count: number;
  list: TenantMediaAsset[];
}

export interface TenantMediaAssetDetailResponse {
  code: number;
  message?: string;
  data: TenantMediaAsset;
}
