import { Injectable } from '@angular/core';

import { readJsonStorage, writeJsonStorage } from '../utils/browser-storage.util';

@Injectable({
  providedIn: 'root'
})
export class UserSettingsService {

  private settings: any = {};

  constructor() {
    this.loadFromSession();
  }

  private loadFromSession() {
    this.settings = readJsonStorage('users_settings', {});
  }

  getLimit(key: string): number {
    return this.settings[key] || 10;
  }

  setLimit(key: string, value: number) {
    this.settings[key] = value;
    writeJsonStorage('users_settings', this.settings);
  }

  getAll() {
    return this.settings;
  }
}
