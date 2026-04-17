import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Account } from '../models/account.model';
import { ImageAsset } from '../models/image.model';

type AccountProfileImageResponse = {
  code: number;
  message?: string;
  profile_image: ImageAsset;
  account?: Account;
};

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/accounts`;
  private readonly accountLookupUrl = `${environment.apiBaseUrl}/api/account`;

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

  get(id: number): Observable<Account> {
    return this.http.get<Account>(`${this.baseUrl}/${id}`);
  }

  add(payload: Partial<Account>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Partial<Account>): Observable<any> {
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

  contacts(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/contacts`);
  }

  deals(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/deals`);
  }

  invoices(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/invoices`);
  }

  getProfileImage(id: number | string): Observable<AccountProfileImageResponse> {
    return this.http.get<AccountProfileImageResponse>(`${this.baseUrl}/${id}/profile-image`);
  }

  uploadProfileImage(id: number | string, file: File): Observable<AccountProfileImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.patch<AccountProfileImageResponse>(`${this.baseUrl}/${id}/profile-image`, formData);
  }

  deleteProfileImage(id: number | string): Observable<AccountProfileImageResponse> {
    return this.http.delete<AccountProfileImageResponse>(`${this.baseUrl}/${id}/profile-image`);
  }

  updateUserSettings(data: Record<string, unknown>): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/api/user-settings`, data);
  }

  searchAccounts(query: string): Observable<any[]> {
    return this.http.get<any[]>(this.accountLookupUrl, {
      params: query ? { search: query } : {},
    });
  }

  search(term: string): Observable<Array<{ id: string; name: string }>> {
    const q = (term || '').trim();
    if (!q) return of([]);

    return this.http
      .get<any>(this.accountLookupUrl, { params: { search: q } })
      .pipe(
        map((res) => {
          const list = Array.isArray(res) ? res : res?.list ?? [];
          return list
            .map((item: any) => ({
              id: String(item?.id ?? ''),
              name: String(item?.account_name ?? ''),
            }))
            .filter((item: { id: string; name: string }) => item.id && item.name);
        })
      );
  }
}
