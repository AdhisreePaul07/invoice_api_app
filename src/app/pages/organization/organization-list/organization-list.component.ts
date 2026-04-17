import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { OrganizationService } from '../../../core/services/organization.service';
@Component({
  selector: 'app-organization-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './organization-list.component.html',
  styleUrls: ['./organization-list.component.scss'],
})
export class OrganizationListComponent implements OnInit {
  loading = false;
  error: string | null = null;

  all: any[] = [];
  filtered: any[] = [];

  searchCtrl = new FormControl<string>('', { nonNullable: true });
  typeCtrl = new FormControl<number>(-1, { nonNullable: true });

  constructor(private orgService: OrganizationService) {}

  ngOnInit(): void {
    this.load();

    this.searchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(() => this.applyFilters());

    this.typeCtrl.valueChanges.subscribe(() => this.applyFilters());
  }

  load(): void {
    this.loading = true;
    this.error = null;

    this.orgService.list().subscribe({
      next: (res: any) => {
        this.loading = false;
        this.all = res?.list || [];
        this.applyFilters();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'Failed to load organizations.';
      },
    });
  }

  applyFilters(): void {
    const q = this.searchCtrl.value.trim().toLowerCase();
    const t = this.typeCtrl.value;

    this.filtered = (this.all || []).filter((organization) => {
      const nameOk =
        !q || String(organization?.org_name || '').toLowerCase().includes(q);
      const typeOk =
        t === -1 || this.planSelectionFromCode(organization?.plan_code) === t;
      return nameOk && typeOk;
    });
  }

  remove(_org: any): void {
    this.error = 'Organization deletion is disabled by the backend.';
  }

  orgTypeLabel(value: number): string {
    if (value === 0) return 'STARTER';
    if (value === 1) return 'GROWTH';
    if (value === 2) return 'ENTERPRISE';
    return 'GROWTH';
  }

  planSelectionFromCode(planCode: string | null | undefined): number {
    switch ((planCode || '').toLowerCase()) {
      case 'starter':
        return 0;
      case 'enterprise':
        return 2;
      case 'growth':
      default:
        return 1;
    }
  }
}
