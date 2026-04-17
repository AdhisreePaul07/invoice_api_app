import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { AccountService } from '../../../core/services/account.service';
import { Account } from '../../../core/models/account.model';
import { extractApiError } from '../../../core/utils/api-error.util';
import { readJsonStorage, writeJsonStorage } from '../../../core/utils/browser-storage.util';
import { imageUrl } from '../../../core/utils/image-upload.util';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './accounts-list.component.html',
  styleUrls: ['./accounts-list.component.scss'],
})
export class AccountListComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;

  all: Account[] = [];
  filtered: Account[] = [];
  selected = new Set<Account>();

  settings = readJsonStorage<Record<string, number>>('users_settings', {});
  listLimit = Number(this.settings['accounts_list_limit']) || 10;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  private destroy$ = new Subject<void>();

  searchCtrl = new FormControl<string>('', { nonNullable: true });
  typeCtrl = new FormControl<string>('', { nonNullable: true });

  constructor(private accountService: AccountService) {}

  ngOnInit(): void {
    this.load();

    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.load();
      });

    this.typeCtrl.valueChanges
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.load();
      });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.action-menu-wrap')) {
      this.filtered.forEach((account: any) => {
        account.showMenu = false;
      });
    }
  }

  load(): void {
    this.loading = true;
    this.error = null;

    const headers = {
      'X-Limit': String(this.listLimit),
      'X-Page': String(this.currentPage),
    };

    const params: Record<string, unknown> = {};
    const search = (this.searchCtrl.value || '').trim();
    if (search) params['search'] = search;

    const type = this.typeCtrl.value;
    if (type !== '') params['account_type'] = type;

    this.accountService.list(headers, params).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.all = Array.isArray(res?.list) ? res.list : [];
        this.filtered = this.all;
        this.totalCount = Number(res?.count ?? 0);
        this.listLimit = Number(res?.limit ?? this.listLimit);
        this.currentPage = Number(res?.page ?? this.currentPage);
        this.totalPages = Number(res?.total_pages ?? 1);
        this.selected.clear();
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to load accounts.');
        this.all = [];
        this.filtered = [];
        this.totalCount = 0;
        this.totalPages = 1;
        this.selected.clear();
      },
    });
  }

  get pages(): number[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const windowSize = 5;
    let start = Math.max(1, current - Math.floor(windowSize / 2));
    let end = start + windowSize - 1;

    if (end > total) {
      end = total;
      start = Math.max(1, end - windowSize + 1);
    }

    const pages: number[] = [];
    for (let page = start; page <= end; page += 1) pages.push(page);
    return pages;
  }

  get showingFrom(): number {
    if (!this.totalCount) return 0;
    return (this.currentPage - 1) * this.listLimit + 1;
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
    settings['accounts_list_limit'] = this.listLimit;
    writeJsonStorage('users_settings', settings);

    this.accountService.updateUserSettings({ accounts_list_limit: this.listLimit }).subscribe({
      next: (res: any) => {
        if (res?.user_settings) {
          writeJsonStorage('users_settings', res.user_settings);
        }
      },
    });

    this.load();
  }

  isAllSelected(): boolean {
    return !!this.filtered.length && this.filtered.every((account) => this.selected.has(account));
  }

  toggleAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.clear();
    if (checked) this.filtered.forEach((account) => this.selected.add(account));
  }

  toggleOne(account: Account, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selected.add(account);
    else this.selected.delete(account);
  }

  remove(account: Account): void {
    if (!account?.id) return;
    if (!confirm(`Delete account "${account.account_name}"?`)) return;

    this.accountService.delete(account.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to delete account.');
      },
    });
  }

  accountTypeLabel(value: number): string {
    return Number(value) === 0 ? 'INDIVIDUAL' : 'BUSINESS';
  }

  accountInitials(account: Account): string {
    return String(account?.account_name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((segment) => segment.charAt(0))
      .join('')
      .toUpperCase() || 'AC';
  }

  accountAvatarUrl(account: Account): string {
    return imageUrl(account?.profile_image);
  }

  primaryContactPhone(account: Account): string {
    return String(account?.contact_details?.[0]?.primary_phone || '').trim() || '-';
  }

  primaryContactEmail(account: Account): string {
    return String(account?.contact_details?.[0]?.primary_email || '').trim() || '-';
  }

  primaryCountry(account: Account): string {
    const address = account?.primary_address || {};
    return String(address.country || address.Country || '').trim() || '-';
  }

  accountStatusLabel(isActive?: boolean): string {
    return isActive === false ? 'Inactive' : 'Active';
  }

  accountStatusClass(isActive?: boolean): string {
    return isActive === false ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success';
  }

  trackById = (_: number, item: Account) => item?.id;

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
