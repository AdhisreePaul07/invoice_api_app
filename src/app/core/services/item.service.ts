import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Item } from '../models/item.model';

@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/items`;

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

  get(id: number): Observable<Item> {
    return this.http.get<Item>(`${this.baseUrl}/${id}`);
  }

  add(payload: Partial<Item>): Observable<any> {
    return this.http.post(`${this.baseUrl}/create`, payload);
  }

  update(id: number, payload: Partial<Item>): Observable<any> {
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

  updateUserSettings(data: Record<string, unknown>): Observable<any> {
    return this.http.post(`${environment.apiBaseUrl}/api/user-settings`, data);
  }
}
