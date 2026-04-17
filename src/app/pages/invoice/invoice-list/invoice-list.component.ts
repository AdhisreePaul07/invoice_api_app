import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { InvoiceService } from '../../../core/services/invoice.service';
import { readJsonStorage, writeJsonStorage } from '../../../core/utils/browser-storage.util';
import { extractApiError } from '../../../core/utils/api-error.util';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.scss'],
})
export class InvoiceListComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;

  all: any[] = [];
  filtered: any[] = [];

  settings = readJsonStorage<Record<string, number>>('users_settings', {});
  listLimit = Number(this.settings['invoices_list_limit']) || 10;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  searchCtrl = new FormControl<string>('', { nonNullable: true });
  statusCtrl = new FormControl<number>(-1, { nonNullable: true });
  typeCtrl = new FormControl<number>(-1, { nonNullable: true });

  private destroy$ = new Subject<void>();

  constructor(private invoiceService: InvoiceService) {}

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

    this.typeCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
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
    if (this.statusCtrl.value !== -1) params['invoice_status'] = this.statusCtrl.value;
    if (this.typeCtrl.value !== -1) params['invoice_type'] = this.typeCtrl.value;

    this.invoiceService.list(headers, params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.all = Array.isArray(res?.list) ? res.list : [];
        this.filtered = this.all;
        this.totalCount = Number(res?.count ?? 0);
        this.listLimit = Number(res?.limit ?? this.listLimit);
        this.currentPage = Number(res?.page ?? this.currentPage);
        this.totalPages = Number(res?.total_pages ?? 1);
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to load invoices.');
        this.all = [];
        this.filtered = [];
        this.totalCount = 0;
        this.totalPages = 1;
      },
    });
  }

  get pages(): number[] {
    const windowSize = 5;
    let start = Math.max(1, this.currentPage - Math.floor(windowSize / 2));
    let end = start + windowSize - 1;

    if (end > this.totalPages) {
      end = this.totalPages;
      start = Math.max(1, end - windowSize + 1);
    }

    const arr: number[] = [];
    for (let i = start; i <= end; i += 1) arr.push(i);
    return arr;
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
    settings['invoices_list_limit'] = this.listLimit;
    writeJsonStorage('users_settings', settings);

    this.invoiceService.updateUserSettings({ invoices_list_limit: this.listLimit }).subscribe({
      next: (resp: any) => {
        if (resp?.user_settings) {
          writeJsonStorage('users_settings', resp.user_settings);
        }
      },
      error: () => undefined,
    });

    this.load();
  }

  invoiceStatusLabel(status: number): string {
    switch (Number(status)) {
      case 0:
        return 'Draft';
      case 1:
        return 'Sent';
      case 2:
        return 'Partial';
      case 3:
        return 'Paid';
      case 4:
        return 'Overdue';
      case 5:
        return 'Void';
      default:
        return '-';
    }
  }

  invoiceStatusClass(status: number): string {
    switch (Number(status)) {
      case 3:
        return 'success';
      case 4:
        return 'danger';
      case 1:
      case 2:
        return 'primary';
      default:
        return 'secondary';
    }
  }

  invoiceTypeLabel(type: number): string {
    switch (Number(type)) {
      case 0:
        return 'Standard';
      case 1:
        return 'Proforma';
      case 2:
        return 'Credit Note';
      default:
        return '-';
    }
  }

  accountName(invoice: any): string {
    return (
      invoice?.account_snapshot?.account_name ||
      invoice?.account_details?.[0]?.account_name ||
      (invoice?.account ? `Account #${invoice.account}` : '-')
    );
  }

  contactName(invoice: any): string {
    const snap = invoice?.contact_snapshot;
    if (snap?.first_name || snap?.last_name) {
      return `${snap.first_name || ''} ${snap.last_name || ''}`.trim();
    }
    const contact = invoice?.contact_details?.[0];
    if (contact) {
      return `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.primary_email || '-';
    }
    return invoice?.contact ? `Contact #${invoice.contact}` : '-';
  }

  toggleActionMenu(invoice: any, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const shouldOpen = !invoice?.showMenu;
    this.closeMenus();
    invoice.showMenu = shouldOpen;
  }

  markSent(invoice: any): void {
    this.closeMenus();
    this.invoiceService.markSent(Number(invoice.id)).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to mark invoice as sent.');
      },
    });
  }

  markPaid(invoice: any): void {
    this.closeMenus();
    this.invoiceService.markPaid(Number(invoice.id)).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to mark invoice as paid.');
      },
    });
  }

  markVoid(invoice: any): void {
    this.closeMenus();
    this.invoiceService.markVoid(Number(invoice.id)).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to void invoice.');
      },
    });
  }

  remove(invoice: any): void {
    if (!confirm(`Delete invoice "${invoice?.invoice_no || ''}"?`)) return;

    this.closeMenus();
    this.invoiceService.delete(Number(invoice.id)).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to delete invoice.');
      },
    });
  }

  exportVisibleCsv(): void {
    const ids = this.filtered.map((invoice: any) => Number(invoice?.id)).filter((id) => !Number.isNaN(id) && id > 0);
    if (!ids.length) return;

    this.invoiceService.exportSelectedCsv(ids).subscribe({
      next: (blob) => this.downloadBlob(blob, 'invoices.csv'),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to export invoices.');
      },
    });
  }

  exportVisiblePdf(): void {
    const ids = this.filtered.map((invoice: any) => Number(invoice?.id)).filter((id) => !Number.isNaN(id) && id > 0);
    if (!ids.length) return;

    this.invoiceService.exportSelectedPdf(ids).subscribe({
      next: (blob) => this.downloadBlob(blob, 'invoices.pdf'),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to export invoices.');
      },
    });
  }

  private closeMenus(): void {
    this.filtered.forEach((invoice: any) => {
      invoice.showMenu = false;
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  trackById = (_: number, item: any) => item?.id;
}
