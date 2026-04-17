import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Invoice } from '../models/invoice.model';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/invoices`;

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

  get(id: number): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.baseUrl}/${id}`);
  }

  add(payload: Partial<Invoice>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Partial<Invoice>): Observable<any> {
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

  markSent(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/mark-sent`, {});
  }

  markPaid(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/mark-paid`, {});
  }

  markVoid(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/mark-void`, {});
  }

  recalculate(id: number): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/recalculate`, {});
  }

  attachDeal(id: number, dealId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/attach-deal`, { deal_id: dealId });
  }

  detachDeal(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/detach-deal`, {});
  }

  enablePublicShare(id: number, payload?: Record<string, unknown>): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/enable-public-share`, payload || {});
  }

  disablePublicShare(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/disable-public-share`, {});
  }

  getPublicShareInfo(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/public-share-info`);
  }

  downloadPdf(id: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/pdf`, { responseType: 'blob' });
  }

  recordPayment(id: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/record-payment`, payload);
  }

  items(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/items`);
  }

  addItem(id: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/items/add`, payload);
  }

  updateItem(id: number, itemId: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.patch(`${this.baseUrl}/${id}/items/${itemId}/update`, payload);
  }

  deleteItem(id: number, itemId: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}/items/${itemId}/delete`);
  }

  reorderItems(id: number, items: Array<number | Record<string, unknown>>): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/items/reorder`, { items });
  }

  receipts(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/receipts`);
  }

  createReceipt(id: number, payload: Record<string, unknown>): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/receipts/create`, payload);
  }

  exportCsv(paramsObj?: Record<string, unknown>): Observable<Blob> {
    let params = new HttpParams();
    if (paramsObj) {
      Object.keys(paramsObj).forEach((key) => {
        const value = paramsObj[key];
        if (value !== null && value !== undefined && value !== '') {
          params = params.set(key, String(value));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/export/csv`, {
      params,
      responseType: 'blob',
    });
  }

  exportSelectedCsv(invoiceIds: number[]): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export/selected-csv`, { invoice_ids: invoiceIds }, { responseType: 'blob' });
  }

  exportSelectedPdf(invoiceIds: number[]): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export/selected-pdf`, { invoice_ids: invoiceIds }, { responseType: 'blob' });
  }

  updateUserSettings(data: Record<string, unknown>): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/api/user-settings`, data);
  }
}
