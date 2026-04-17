import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Receipt } from '../models/receipt.model';

@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/receipts`;

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

  add(payload: Partial<Receipt>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Partial<Receipt>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/update`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}/delete`);
  }

  markCompleted(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/mark-completed`, {});
  }

  markFailed(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/mark-failed`, {});
  }

  markCancelled(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/mark-cancelled`, {});
  }
}
