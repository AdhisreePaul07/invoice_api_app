import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { ReceiptService } from '../../../core/services/receipt.service';
import { readJsonStorage, writeJsonStorage } from '../../../core/utils/browser-storage.util';
import { extractApiError } from '../../../core/utils/api-error.util';

@Component({
  selector: 'app-receipt-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './receipt-list.component.html',
  styleUrls: ['./receipt-list.component.scss'],
})
export class ReceiptListComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;

  all: any[] = [];
  filtered: any[] = [];

  listLimit = Number(readJsonStorage<Record<string, number>>('users_settings', {})['receipts_list_limit']) || 10;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  private destroy$ = new Subject<void>();
  searchCtrl = new FormControl('', { nonNullable: true });
  statusCtrl = new FormControl(-1, { nonNullable: true });
  paymentMethodCtrl = new FormControl(-1, { nonNullable: true });

  readonly paymentMethods = [
    { value: 0, label: 'Cash' },
    { value: 1, label: 'Bank Transfer' },
    { value: 2, label: 'UPI' },
    { value: 3, label: 'Card' },
    { value: 4, label: 'PayPal' },
    { value: 5, label: 'Wise' },
    { value: 6, label: 'Payoneer' },
    { value: 7, label: 'Others' },
  ];

  constructor(private receiptService: ReceiptService) {}

  ngOnInit(): void {
    this.load();

    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.load();
      });

    this.statusCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.currentPage = 1;
      this.load();
    });

    this.paymentMethodCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.currentPage = 1;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.action-menu-wrap')) {
      this.closeMenus();
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
    const search = this.searchCtrl.value.trim();
    if (search) params['search'] = search;
    if (this.statusCtrl.value !== -1) params['receipt_status'] = this.statusCtrl.value;
    if (this.paymentMethodCtrl.value !== -1) params['payment_method'] = this.paymentMethodCtrl.value;

    this.receiptService.list(headers, params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.all = Array.isArray(res?.list) ? res.list : [];
        this.filtered = this.all;
        this.totalPages = Number(res?.total_pages || 1);
        this.currentPage = Number(res?.page || 1);
        this.totalCount = Number(res?.count || 0);
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to load receipts.');
        this.all = [];
        this.filtered = [];
        this.totalPages = 1;
        this.totalCount = 0;
      },
    });
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
    settings['receipts_list_limit'] = this.listLimit;
    writeJsonStorage('users_settings', settings);

    this.load();
  }

  invoiceNo(receipt: any): string {
    return receipt?.invoice_snapshot?.invoice_no || '-';
  }

  accountName(receipt: any): string {
    return receipt?.invoice_snapshot?.account_name || '-';
  }

  statusLabel(status: number): string {
    switch (Number(status)) {
      case 0:
        return 'Completed';
      case 1:
        return 'Failed';
      case 2:
        return 'Cancelled';
      default:
        return '-';
    }
  }

  toggleActionMenu(receipt: any, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const shouldOpen = !receipt?.showMenu;
    this.closeMenus();
    receipt.showMenu = shouldOpen;
  }

  remove(receipt: any): void {
    if (!confirm(`Delete receipt "${receipt?.receipt_no || ''}"?`)) return;

    this.closeMenus();
    this.receiptService.delete(Number(receipt.id)).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to delete receipt.');
      },
    });
  }

  private closeMenus(): void {
    this.filtered.forEach((receipt: any) => {
      receipt.showMenu = false;
    });
  }

  trackById = (_: number, item: any) => item?.id;
}
