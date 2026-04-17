import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CurrencyOption, InvoiceSettings, Organization } from '../models/organization.model';
import { ImageAsset } from '../models/image.model';

type OrganizationImageField = 'profile_image' | 'company_logo' | 'company_stamp';

export interface OrganizationImageResponse {
  code: number;
  message?: string;
  organization?: Organization | null;
  profile_image?: ImageAsset;
  company_logo?: ImageAsset;
  company_stamp?: ImageAsset;
}

@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/organization`;

  constructor(private http: HttpClient) {}

  list(): Observable<any> {
    return this.http.get(this.baseUrl);
  }

  get(id: number): Observable<Organization> {
    return this.http.get<Organization>(`${this.baseUrl}/${id}`);
  }

  getCurrent(): Observable<any> {
    return this.http.get(`${this.baseUrl}/detail/`);
  }

  getCurrencyCatalog(): Observable<CurrencyOption[]> {
    return this.http.get<CurrencyOption[]>(`${environment.apiBaseUrl}/api/currency`);
  }

  getReceiptDueOptions(): Observable<Array<{ id: number; code: number; value: string }>> {
    return this.http.get<Array<{ id: number; code: number; value: string }>>(
      `${environment.apiBaseUrl}/api/receiptdue`
    );
  }

  getStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}/status`);
  }

  add(payload: Partial<Organization>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Partial<Organization>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}`, payload);
  }

  updateCurrent(payload: Partial<Organization>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/update`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/delete/${id}`);
  }

  getInvoiceSettings(): Observable<{ code: number; invoice_settings: InvoiceSettings }> {
    return this.http.get<{ code: number; invoice_settings: InvoiceSettings }>(`${this.baseUrl}/invoice-settings`);
  }

  updateInvoiceSettings(payload: InvoiceSettings): Observable<{ code: number; message: string; invoice_settings: InvoiceSettings }> {
    return this.http.patch<{ code: number; message: string; invoice_settings: InvoiceSettings }>(
      `${this.baseUrl}/invoice-settings/update`,
      payload
    );
  }

  getBrandSettings(): Observable<any> {
    return this.http.get(`${this.baseUrl}/brand-settings`);
  }

  updateBrandSettings(payload: Record<string, unknown>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/brand-settings/update`, payload);
  }

  sendInvitation(payload: Record<string, unknown>): Observable<any> {
    return this.http.post(`${this.baseUrl}/invitations/send`, payload);
  }

  getOrganizationImage(field: OrganizationImageField): Observable<OrganizationImageResponse> {
    return this.http.get<OrganizationImageResponse>(`${this.baseUrl}/${this.imageRoute(field)}`);
  }

  uploadOrganizationImage(field: OrganizationImageField, file: File): Observable<OrganizationImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.patch<OrganizationImageResponse>(`${this.baseUrl}/${this.imageRoute(field)}`, formData);
  }

  deleteOrganizationImage(field: OrganizationImageField): Observable<OrganizationImageResponse> {
    return this.http.delete<OrganizationImageResponse>(`${this.baseUrl}/${this.imageRoute(field)}`);
  }

  private imageRoute(field: OrganizationImageField): string {
    switch (field) {
      case 'profile_image':
        return 'profile-image';
      case 'company_logo':
        return 'company-logo';
      case 'company_stamp':
        return 'company-stamp';
      default:
        return 'profile-image';
    }
  }
}
