import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AppSettingsMap, AppSettingsResponse, InvoiceTemplateAppSetting } from '../models/app-settings.model';
import {
  TenantMediaAsset,
  TenantMediaAssetDetailResponse,
  TenantMediaAssetListResponse,
  TenantAssetType,
} from '../models/image.model';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/app-settings`;
  private readonly assetsUrl = `${this.baseUrl}/assets`;

  constructor(private readonly http: HttpClient) {}

  getSettings(): Observable<AppSettingsResponse> {
    return this.http.get<AppSettingsResponse>(this.baseUrl);
  }

  updateSettings(payload: Partial<AppSettingsMap>): Observable<AppSettingsResponse> {
    return this.http.patch<AppSettingsResponse>(this.baseUrl, payload);
  }

  getInvoiceTemplates(): Observable<InvoiceTemplateAppSetting[]> {
    return this.getSettings().pipe(map((response) => response?.settings?.invoice_template || []));
  }

  updateInvoiceTemplates(templates: InvoiceTemplateAppSetting[]): Observable<AppSettingsResponse> {
    return this.updateSettings({ invoice_template: templates });
  }

  getAssets(filters?: { assetType?: TenantAssetType; assetKey?: string }): Observable<TenantMediaAssetListResponse> {
    let params = new HttpParams();

    if (filters?.assetType) {
      params = params.set('asset_type', filters.assetType);
    }

    if (filters?.assetKey) {
      params = params.set('asset_key', filters.assetKey);
    }

    return this.http.get<TenantMediaAssetListResponse>(this.assetsUrl, { params });
  }

  uploadAsset(payload: {
    file: File;
    assetType: TenantAssetType;
    assetKey?: string;
    title?: string;
    extraMeta?: Record<string, unknown>;
  }): Observable<TenantMediaAssetDetailResponse> {
    const formData = this.buildAssetFormData(payload);
    return this.http.post<TenantMediaAssetDetailResponse>(this.assetsUrl, formData);
  }

  replaceAsset(
    assetId: number,
    payload: {
      file?: File;
      assetType?: TenantAssetType;
      assetKey?: string;
      title?: string;
      extraMeta?: Record<string, unknown>;
    },
  ): Observable<TenantMediaAssetDetailResponse> {
    const hasFile = payload.file instanceof File;
    const body = hasFile ? this.buildAssetFormData(payload) : this.buildAssetJsonPayload(payload);
    return this.http.patch<TenantMediaAssetDetailResponse>(`${this.assetsUrl}/${assetId}`, body);
  }

  deleteAsset(assetId: number): Observable<{ code: number; message?: string }> {
    return this.http.delete<{ code: number; message?: string }>(`${this.assetsUrl}/${assetId}`);
  }

  findFirstAsset(
    response: AppSettingsResponse | null | undefined,
    assetType: TenantAssetType,
    assetKey?: string,
  ): TenantMediaAsset | null {
    const groupedAssets = response?.assets?.grouped?.[assetType] || [];
    if (!groupedAssets.length) {
      return null;
    }

    if (!assetKey) {
      return groupedAssets[0] || null;
    }

    return groupedAssets.find((asset) => String(asset.asset_key || '') === assetKey) || null;
  }

  private buildAssetFormData(payload: {
    file?: File;
    assetType?: TenantAssetType;
    assetKey?: string;
    title?: string;
    extraMeta?: Record<string, unknown>;
  }): FormData {
    const formData = new FormData();

    if (payload.file) {
      formData.append('file', payload.file);
    }

    if (payload.assetType) {
      formData.append('asset_type', payload.assetType);
    }

    if (payload.assetKey) {
      formData.append('asset_key', payload.assetKey);
    }

    if (payload.title) {
      formData.append('title', payload.title);
    }

    if (payload.extraMeta && Object.keys(payload.extraMeta).length) {
      formData.append('extra_meta', JSON.stringify(payload.extraMeta));
    }

    return formData;
  }

  private buildAssetJsonPayload(payload: {
    assetType?: TenantAssetType;
    assetKey?: string;
    title?: string;
    extraMeta?: Record<string, unknown>;
  }): Partial<TenantMediaAsset> {
    const body: Record<string, unknown> = {};

    if (payload.assetType) {
      body['asset_type'] = payload.assetType;
    }

    if (payload.assetKey !== undefined) {
      body['asset_key'] = payload.assetKey;
    }

    if (payload.title !== undefined) {
      body['title'] = payload.title;
    }

    if (payload.extraMeta !== undefined) {
      body['extra_meta'] = payload.extraMeta;
    }

    return body;
  }
}
