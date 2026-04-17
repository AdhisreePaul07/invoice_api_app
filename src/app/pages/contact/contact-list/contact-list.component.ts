import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';

import { ContactService } from '../../../core/services/contact.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { readJsonStorage, writeJsonStorage } from '../../../core/utils/browser-storage.util';
import { imageUrl } from '../../../core/utils/image-upload.util';

@Component({
  selector: 'app-contact-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './contact-list.component.html',
  styleUrls: ['./contact-list.component.scss'],
})
export class ContactListComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;

  all: any[] = [];
  filtered: any[] = [];
  selected = new Set<any>();

  listLimit = Number(readJsonStorage<Record<string, number>>('users_settings', {})['contacts_list_limit']) || 10;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  private destroy$ = new Subject<void>();
  searchCtrl = new FormControl('', { nonNullable: true });

  constructor(private contactService: ContactService) {}

  ngOnInit(): void {
    this.load();

    this.searchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
        switchMap(() => {
          this.currentPage = 1;
          return this.load$();
        })
      )
      .subscribe({
        next: (res) => this.applyResponse(res),
        error: (err) => this.applyError(err),
      });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.action-menu-wrap')) {
      this.filtered.forEach((contact: any) => {
        contact.showMenu = false;
      });
    }
  }

  load(): void {
    this.load$().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => this.applyResponse(res),
      error: (err) => this.applyError(err),
    });
  }

  private load$(): Observable<any> {
    this.loading = true;
    this.error = null;

    const headers = {
      'X-Limit': String(this.listLimit),
      'X-Page': String(this.currentPage),
    };

    const params = {
      search: this.searchCtrl.value || '',
      page: this.currentPage,
      limit: this.listLimit,
    };

    return this.contactService.list(headers, params);
  }

  private applyResponse(res: any): void {
    this.loading = false;

    if (Array.isArray(res?.list)) {
      this.all = res.list;
      this.filtered = this.all;
      this.totalPages = Number(res?.total_pages || 1);
      this.currentPage = Number(res?.page || 1);
      this.totalCount = Number(res?.count || 0);
    } else {
      this.all = [];
      this.filtered = [];
      this.totalPages = 1;
      this.totalCount = 0;
    }

    this.selected.clear();
  }

  private applyError(err: any): void {
    this.loading = false;
    this.error = extractApiError(err, 'Failed to load contacts.');
    this.all = [];
    this.filtered = [];
    this.totalPages = 1;
    this.totalCount = 0;
    this.selected.clear();
  }

  get pages(): number[] {
    const windowSize = 5;
    let start = Math.max(1, this.currentPage - 2);
    let end = Math.min(this.totalPages, start + windowSize - 1);

    if (end - start < windowSize - 1) {
      start = Math.max(1, end - windowSize + 1);
    }

    const arr: number[] = [];
    for (let i = start; i <= end; i += 1) arr.push(i);
    return arr;
  }

  get showingFrom(): number {
    return this.totalCount ? (this.currentPage - 1) * this.listLimit + 1 : 0;
  }

  get showingTo(): number {
    return Math.min(this.totalCount, this.currentPage * this.listLimit);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.load();
  }

  changeLimit(limit: number): void {
    this.listLimit = +limit;
    this.currentPage = 1;

    const settings = readJsonStorage<Record<string, number>>('users_settings', {});
    settings['contacts_list_limit'] = this.listLimit;
    writeJsonStorage('users_settings', settings);

    this.contactService.updateUserSettings({ contacts_list_limit: this.listLimit }).subscribe({
      next: (res: any) => {
        if (res?.user_settings) {
          writeJsonStorage('users_settings', res.user_settings);
        }
      },
      error: () => undefined,
    });

    this.load();
  }

  initials(contact: any): string {
    return (((contact?.first_name?.[0] || '') + (contact?.last_name?.[0] || '')).toUpperCase() || 'NA');
  }

  contactAvatarUrl(contact: any): string {
    return imageUrl(contact?.profile_image);
  }

  fullName(contact: any): string {
    return `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || '-';
  }

  getAccountNames(contact: any): string {
    const accounts = Array.isArray(contact?.account_details) ? contact.account_details : [];
    const names = accounts.map((account: any) => String(account?.account_name || '').trim()).filter(Boolean);
    return names.length ? names.join(', ') : '-';
  }

  contactStatusLabel(isActive?: boolean): string {
    return isActive === false ? 'Inactive' : 'Active';
  }

  contactStatusClass(isActive?: boolean): string {
    return isActive === false ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success';
  }

  isAllSelected(): boolean {
    return !!this.filtered.length && this.filtered.every((contact) => this.selected.has(contact));
  }

  toggleAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.clear();
    if (checked) this.filtered.forEach((contact) => this.selected.add(contact));
  }

  toggleOne(contact: any, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selected.add(contact);
    else this.selected.delete(contact);
  }

  remove(contact: any): void {
    if (!confirm(`Delete contact "${contact.first_name} ${contact.last_name}"?`)) return;

    this.contactService.delete(contact.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to delete contact.');
      },
    });
  }

  trackById = (_: number, item: any) => item?.id;

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
