import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { DealService } from '../../../core/services/deal.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { readJsonStorage, writeJsonStorage } from '../../../core/utils/browser-storage.util';

type DealStatusOption = { value: number; label: string };
type DealViewMode = 'board' | 'list';
type DealBoardColumn = {
  value: number;
  label: string;
  deals: any[];
  dropListId: string;
};

@Component({
  selector: 'app-deal-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DragDropModule],
  templateUrl: './deal-list.component.html',
  styleUrls: ['./deal-list.component.scss'],
})
export class DealListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly viewModeStorageKey = 'deals_view_mode';

  searchCtrl = new FormControl<string>('', { nonNullable: true });
  statusCtrl = new FormControl<number>(-1, { nonNullable: true });
  viewMode: DealViewMode = this.readStoredViewMode();

  loading = false;
  error = '';

  settings = readJsonStorage<Record<string, number>>('users_settings', {});
  listLimit = Number(this.settings['deals_list_limit']) || 10;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  all: any[] = [];
  filtered: any[] = [];
  boardColumns: DealBoardColumn[] = [];
  selected = new Set<any>();
  changingStatusDealId: number | null = null;

  readonly fallbackStatusOptions: DealStatusOption[] = [
    { value: 0, label: 'Open' },
    { value: 1, label: 'In Progress' },
    { value: 2, label: 'Won' },
    { value: 3, label: 'Lost' },
  ];
  statusOptions: DealStatusOption[] = [...this.fallbackStatusOptions];

  constructor(private dealService: DealService) {}

  ngOnInit(): void {
    this.loadStatusOptions();
    this.loadDeals();

    this.searchCtrl.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadDeals();
      });

    this.statusCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.currentPage = 1;
      this.loadDeals();
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
      this.filtered.forEach((deal: any) => {
        deal.showMenu = false;
      });
    }

    if (!target.closest('.status-menu-wrap')) {
      this.filtered.forEach((deal: any) => {
        deal.showStatusMenu = false;
      });
    }
  }

  private readStoredViewMode(): DealViewMode {
    if (typeof window === 'undefined') {
      return 'board';
    }

    return window.localStorage.getItem(this.viewModeStorageKey) === 'list' ? 'list' : 'board';
  }

  setViewMode(mode: DealViewMode): void {
    this.viewMode = mode;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.viewModeStorageKey, mode);
    }
  }

  loadDeals(options?: { silent?: boolean }): void {
    const silent = options?.silent === true;
    if (!silent) {
      this.loading = true;
      this.error = '';
    }

    const headers = {
      'X-Limit': String(this.listLimit),
      'X-Page': String(this.currentPage),
    };

    const params: Record<string, unknown> = {};
    const search = this.searchCtrl.value.trim();
    if (search) params['search'] = search;
    if (this.statusCtrl.value !== -1) params['deal_status'] = this.statusCtrl.value;

    this.dealService.list(headers, params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.all = Array.isArray(res?.list) ? res.list : [];
        this.filtered = this.all;
        this.totalCount = Number(res?.count ?? 0);
        this.listLimit = Number(res?.limit ?? this.listLimit);
        this.currentPage = Number(res?.page ?? this.currentPage);
        this.totalPages = Number(res?.total_pages ?? 1);
        this.closeMenus();
        this.selected.clear();
        this.syncBoardColumns();
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'We could not load deals right now. Please try again.');
        if (!silent) {
          this.all = [];
          this.filtered = [];
          this.totalCount = 0;
          this.totalPages = 1;
          this.closeMenus();
          this.selected.clear();
          this.syncBoardColumns();
        }
      },
    });
  }

  private loadStatusOptions(): void {
    this.dealService
      .statusChoices()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const options = Array.isArray(res?.choices)
            ? res.choices
                .map((choice: any) => ({
                  value: Number(choice?.value),
                  label: String(choice?.label || '').trim(),
                }))
                .filter((choice: DealStatusOption) => !Number.isNaN(choice.value) && choice.label)
            : [];

          this.statusOptions = options.length ? options : [...this.fallbackStatusOptions];
          this.syncBoardColumns();
        },
        error: () => {
          this.statusOptions = [...this.fallbackStatusOptions];
          this.syncBoardColumns();
        },
      });
  }

  get connectedBoardIds(): string[] {
    return this.boardColumns.map((column) => column.dropListId);
  }

  private closeMenus(): void {
    this.filtered.forEach((deal: any) => {
      deal.showMenu = false;
      deal.showStatusMenu = false;
    });
  }

  toggleCardMenu(deal: any): void {
    const shouldOpen = !deal.showMenu;
    this.closeMenus();
    deal.showMenu = shouldOpen;
  }

  toggleStatusMenu(deal: any): void {
    if (this.changingStatusDealId === deal?.id) return;

    const shouldOpen = !deal.showStatusMenu;
    this.closeMenus();
    deal.showStatusMenu = shouldOpen;
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

  changeLimit(limit: number | string): void {
    this.listLimit = Number(limit);
    this.currentPage = 1;

    const settings = readJsonStorage<Record<string, number>>('users_settings', {});
    settings['deals_list_limit'] = this.listLimit;
    writeJsonStorage('users_settings', settings);

    this.dealService.updateUserSettings({ deals_list_limit: this.listLimit }).subscribe({
      next: (res: any) => {
        if (res?.user_settings) {
          writeJsonStorage('users_settings', res.user_settings);
        }
      },
      error: () => undefined,
    });

    this.loadDeals();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.loadDeals();
  }

  getAccountName(deal: any): string {
    const primary = deal?.account_details?.[0]?.account_name;
    if (primary) return primary;
    const account = deal?.account;
    return account ? `Account #${account}` : '-';
  }

  getContactLabel(deal: any): string {
    const contact = deal?.contact_details?.[0];
    if (contact) return `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.primary_email || '-';
    return deal?.contact ? `Contact #${deal.contact}` : '-';
  }

  dealInitials(deal: any): string {
    return String(deal?.deal_name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((segment) => segment.charAt(0))
      .join('')
      .toUpperCase() || 'DL';
  }

  getDealStatusLabel(status: number): string {
    return this.statusOptions.find((option) => option.value === Number(status))?.label || '-';
  }

  private getStatusTone(status: number): 'primary' | 'accent' | 'success' | 'danger' | 'secondary' {
    switch (Number(status)) {
      case 0:
        return 'primary';
      case 1:
        return 'accent';
      case 2:
        return 'success';
      case 3:
        return 'danger';
      default:
        return 'secondary';
    }
  }

  getColumnCardClass(status: number): string {
    return `bg-${this.getStatusTone(status)}-subtle`;
  }

  getActionButtonClass(status: number): string {
    return `btn-action-${this.getStatusTone(status)}`;
  }

  getBoardCardBorderClass(status: number): string {
    return `action-border-${this.getStatusTone(status)}`;
  }

  getStatusButtonClass(status: number): string {
    return `btn-subtle-${this.getStatusTone(status)}`;
  }

  getProgressTrackClass(status: number): string {
    return `bg-${this.getStatusTone(status)}-subtle`;
  }

  getProgressBarClass(status: number): string {
    return `bg-${this.getStatusTone(status)}`;
  }

  getDealProgress(status: number): number {
    switch (Number(status)) {
      case 0:
        return 24;
      case 1:
        return 62;
      case 2:
        return 100;
      case 3:
        return 100;
      default:
        return 18;
    }
  }

  getDealSummary(deal: any): string {
    const description = String(deal?.description || '').trim();
    if (description) return description;

    const account = this.getAccountName(deal);
    const contact = this.getContactLabel(deal);
    if (account !== '-' || contact !== '-') {
      return `Opportunity with ${account !== '-' ? account : 'an account'}${contact !== '-' ? ` and ${contact}` : ''}.`;
    }

    return 'Opportunity details are ready for your sales pipeline.';
  }

  private initialsFromText(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  accountInitial(deal: any): string {
    const label = this.getAccountName(deal);
    return label === '-' ? '' : this.initialsFromText(label);
  }

  contactInitial(deal: any): string {
    const label = this.getContactLabel(deal);
    return label === '-' ? '' : this.initialsFromText(label);
  }

  private boardColumnId(statusValue: number): string {
    return `deal-board-column-${statusValue}`;
  }

  private syncBoardColumns(): void {
    this.boardColumns = this.statusOptions.map((status) => ({
      value: status.value,
      label: status.label,
      deals: this.filtered.filter((deal: any) => Number(deal?.deal_status) === status.value),
      dropListId: this.boardColumnId(status.value),
    }));
  }

  private applyLocalDealStatus(dealId: number, statusValue: number): void {
    const nextStatus = Number(statusValue);

    this.filtered.forEach((deal: any) => {
      if (Number(deal?.id) === dealId) {
        deal.deal_status = nextStatus;
      }
    });

    this.all.forEach((deal: any) => {
      if (Number(deal?.id) === dealId) {
        deal.deal_status = nextStatus;
      }
    });
  }

  onBoardDrop(event: CdkDragDrop<any[]>, targetStatusValue: number): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    const deal = event.item.data;
    if (!deal?.id || this.changingStatusDealId === Number(deal.id)) {
      this.syncBoardColumns();
      return;
    }

    const previousStatus = Number(deal.deal_status);
    const sourceSnapshot = [...event.previousContainer.data];
    const targetSnapshot = [...event.container.data];

    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
    this.applyLocalDealStatus(Number(deal.id), Number(targetStatusValue));
    this.closeMenus();
    this.changingStatusDealId = Number(deal.id);

    this.dealService
      .changeStatus(Number(deal.id), Number(targetStatusValue))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.changingStatusDealId = null;
          deal.showStatusMenu = false;
          this.loadDeals({ silent: true });
        },
        error: (err) => {
          this.changingStatusDealId = null;
          event.previousContainer.data.splice(0, event.previousContainer.data.length, ...sourceSnapshot);
          event.container.data.splice(0, event.container.data.length, ...targetSnapshot);
          this.applyLocalDealStatus(Number(deal.id), previousStatus);
          this.syncBoardColumns();
          this.error = extractApiError(err, 'Failed to update deal status.');
        },
      });
  }

  updateDealStatus(deal: any, statusValue: number): void {
    if (!deal?.id || this.changingStatusDealId === deal.id) return;

    if (Number(deal.deal_status) === Number(statusValue)) {
      deal.showStatusMenu = false;
      return;
    }

    this.changingStatusDealId = deal.id;
    const previousStatus = Number(deal.deal_status);
    deal.showStatusMenu = false;
    this.applyLocalDealStatus(Number(deal.id), Number(statusValue));
    this.syncBoardColumns();
    this.dealService
      .changeStatus(deal.id, Number(statusValue))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.changingStatusDealId = null;
          this.loadDeals({ silent: true });
        },
        error: (err) => {
          this.changingStatusDealId = null;
          this.applyLocalDealStatus(Number(deal.id), previousStatus);
          this.syncBoardColumns();
          this.error = extractApiError(err, 'Failed to update deal status.');
        },
      });
  }

  getDealStatusClass(status: number): string {
    switch (Number(status)) {
      case 2:
        return 'success';
      case 3:
        return 'danger';
      case 1:
        return 'primary';
      default:
        return 'secondary';
    }
  }

  getDealStatusBadgeClass(status: number): string {
    const tone = this.getDealStatusClass(status);
    return `bg-${tone}-subtle text-${tone}`;
  }

  isAllSelected(): boolean {
    return !!this.filtered.length && this.filtered.every((deal) => this.selected.has(deal));
  }

  toggleAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.clear();
    if (checked) this.filtered.forEach((deal) => this.selected.add(deal));
  }

  toggleOne(deal: any, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selected.add(deal);
    else this.selected.delete(deal);
  }

  removeDeal(deal: any): void {
    if (!confirm(`Remove deal "${deal?.deal_name || 'this deal'}"?`)) return;

    this.dealService.delete(deal.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.filtered.length <= 1 && this.currentPage > 1) this.currentPage -= 1;
        this.loadDeals();
      },
      error: (err) => {
        this.error = extractApiError(err, 'Failed to remove deal.');
      },
    });
  }

  trackByStatus = (_: number, column: DealBoardColumn) => column.value;

  trackById(_: number, row: any) {
    return row?.id;
  }
}
