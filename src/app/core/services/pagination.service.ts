import { Injectable } from '@angular/core';

import { readStorageValue, writeStorageValue } from '../utils/browser-storage.util';

@Injectable({
  providedIn: 'root'
})
export class PaginationService {

  getLimit(key: string): number {
    return Number(readStorageValue(`${key}_limit`)) || 10;
  }

  getPage(key: string): number {
    return Number(readStorageValue(`${key}_page`)) || 1;
  }

  setLimit(key: string, value: number): void {
    writeStorageValue(`${key}_limit`, value.toString());
  }

  setPage(key: string, value: number): void {
    writeStorageValue(`${key}_page`, value.toString());
  }

  getHeaders(key: string) {
    return {
      'X-Limit': this.getLimit(key).toString(),
      'X-Page': this.getPage(key).toString()
    };
  }

  getTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit);
  }
}
