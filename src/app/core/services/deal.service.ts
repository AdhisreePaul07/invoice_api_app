import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Deal } from '../models/deal.model';

@Injectable({ providedIn: 'root' })
export class DealService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/deals`;

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

  get(id: number): Observable<Deal> {
    return this.http.get<Deal>(`${this.baseUrl}/${id}`);
  }

  add(payload: Partial<Deal>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Partial<Deal>): Observable<any> {
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

  changeStatus(id: number, deal_status: number, actual_close_date?: string | null): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/change-status`, {
      deal_status,
      actual_close_date: actual_close_date || undefined,
    });
  }

  statusChoices(): Observable<any> {
    return this.http.get(`${this.baseUrl}/status-choices`);
  }

  linkAccount(id: number, accountId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/link-account`, { account_id: accountId });
  }

  unlinkAccount(id: number, accountId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/unlink-account`, { account_id: accountId });
  }

  linkContact(id: number, contactId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/link-contact`, { contact_id: contactId });
  }

  unlinkContact(id: number, contactId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/unlink-contact`, { contact_id: contactId });
  }

  accounts(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/accounts`);
  }

  contacts(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/contacts`);
  }

  invoices(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/invoices`);
  }

  updateUserSettings(data: Record<string, unknown>): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/api/user-settings`, data);
  }
}
