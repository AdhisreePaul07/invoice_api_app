import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Contact } from '../models/contact.model';
import { ImageAsset } from '../models/image.model';

type ContactProfileImageResponse = {
  code: number;
  message?: string;
  profile_image: ImageAsset;
  contact?: Contact;
};

@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/contacts`;

  constructor(private http: HttpClient) {}

  list(headersObj?: Record<string, string>, paramsObj?: Record<string, unknown>): Observable<any> {
    let params = new HttpParams();

    if (paramsObj) {
      Object.keys(paramsObj).forEach((key) => {
        const value = paramsObj[key];
        if (value !== null && value !== undefined && value !== '' && value !== -1) {
          params = params.set(key, String(value));
        }
      });
    }

    const headers = new HttpHeaders(headersObj || {});
    return this.http.get(this.baseUrl, { headers, params });
  }

  get(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}`);
  }

  add(payload: Record<string, unknown>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/update`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}/delete`);
  }

  archive(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/archive`, {});
  }

  restore(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/restore`, {});
  }

  linkAccount(id: number, accountId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/link-account`, { account_id: accountId });
  }

  unlinkAccount(id: number, accountId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/unlink-account`, { account_id: accountId });
  }

  accounts(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/accounts`);
  }

  invoices(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/invoices`);
  }

  deals(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/deals`);
  }

  getProfileImage(id: number | string): Observable<ContactProfileImageResponse> {
    return this.http.get<ContactProfileImageResponse>(`${this.baseUrl}/${id}/profile-image`);
  }

  uploadProfileImage(id: number | string, file: File): Observable<ContactProfileImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.patch<ContactProfileImageResponse>(`${this.baseUrl}/${id}/profile-image`, formData);
  }

  deleteProfileImage(id: number | string): Observable<ContactProfileImageResponse> {
    return this.http.delete<ContactProfileImageResponse>(`${this.baseUrl}/${id}/profile-image`);
  }

  updateUserSettings(data: Record<string, unknown>): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/api/user-settings`, data);
  }
}
