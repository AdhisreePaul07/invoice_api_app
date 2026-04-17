import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { ItemService } from '../../../core/services/item.service';
import { Item } from '../../../core/models/item.model';
import { extractApiError } from '../../../core/utils/api-error.util';
import { readJsonStorage, writeJsonStorage } from '../../../core/utils/browser-storage.util';

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.scss'],
})
export class ItemListComponent implements OnInit, OnDestroy {
  loading = false;
  error: string | null = null;

  all: Item[] = [];
  filtered: Item[] = [];
  selected = new Set<Item>();

  settings = readJsonStorage<Record<string, number>>('users_settings', {});
  listLimit = Number(this.settings['items_list_limit']) || 10;
  currentPage = 1;
  totalPages = 1;
  totalCount = 0;

  private destroy$ = new Subject<void>();
  searchCtrl = new FormControl<string>('', { nonNullable: true });

  constructor(private itemService: ItemService) {}

  ngOnInit(): void {
    this.load();

    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
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
      this.filtered.forEach((item: any) => {
        item.showMenu = false;
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

    const params = {
      search: this.searchCtrl.value || '',
      page: this.currentPage,
      limit: this.listLimit,
    };

    this.itemService.list(headers, params).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.all = Array.isArray(res?.list) ? res.list : [];
        this.filtered = this.all;
        this.totalPages = Number(res?.total_pages || 1);
        this.currentPage = Number(res?.page || 1);
        this.totalCount = Number(res?.count || 0);
        this.selected.clear();
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to load items.');
        this.all = [];
        this.filtered = [];
        this.totalPages = 1;
        this.totalCount = 0;
        this.selected.clear();
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
    settings['items_list_limit'] = this.listLimit;
    writeJsonStorage('users_settings', settings);

    this.itemService.updateUserSettings({ items_list_limit: this.listLimit }).subscribe({
      next: (res: any) => {
        if (res?.user_settings) {
          writeJsonStorage('users_settings', res.user_settings);
        }
      },
      error: () => undefined,
    });

    this.load();
  }

  isAllSelected(): boolean {
    return !!this.filtered.length && this.filtered.every((item) => this.selected.has(item));
  }

  toggleAll(ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.clear();
    if (checked) this.filtered.forEach((item) => this.selected.add(item));
  }

  toggleOne(item: Item, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selected.add(item);
    else this.selected.delete(item);
  }

  remove(item: Item): void {
    if (!item?.id) return;
    if (!confirm(`Delete item "${item.item_name}"?`)) return;

    this.itemService.delete(item.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = extractApiError(err, 'Failed to delete item.');
      },
    });
  }

  itemInitials(item: Item): string {
    return String(item?.item_name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((segment) => segment.charAt(0))
      .join('')
      .toUpperCase() || 'IT';
  }

  itemStatusLabel(isActive?: boolean): string {
    return isActive === false ? 'Inactive' : 'Active';
  }

  itemStatusClass(isActive?: boolean): string {
    return isActive === false ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success';
  }

  trackById = (_: number, item: Item) => item?.id;

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
