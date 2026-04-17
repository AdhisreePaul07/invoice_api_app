import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { ItemService } from '../../../core/services/item.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type CurrencyLite = { shortname: string; symbol: string; name: string };

@Component({
  selector: 'app-item-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './item-edit.component.html',
  styleUrls: ['./item-edit.component.scss'],
})
export class ItemEditComponent implements OnInit {
  form: FormGroup;
  loading = false;
  saving = false;
  error: string | null = null;
  itemId = 0;
  item: any | null = null;
  currencies: CurrencyLite[] = [];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private itemService: ItemService
  ) {
    this.form = this.fb.group({
      item_name: ['', [Validators.required, Validators.minLength(2)]],
      item_code: ['', [Validators.required]],
      item_details: [''],
      default_unit_price: [0, [Validators.required, Validators.min(0)]],
      default_tax_value: [0, [Validators.min(0)]],
      currency_code: ['INR', [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.itemId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadCurrencies();
    this.loadItem();
  }

  get itemTitle(): string {
    return String(this.form.get('item_name')?.value || '').trim() || 'Item';
  }

  get currencyLabel(): string {
    const code = String(this.form.get('currency_code')?.value || '').trim();
    const currency = this.currencies.find((entry) => entry.shortname === code);
    if (!currency) return code || 'Not selected';
    return `${currency.shortname}${currency.symbol ? ` (${currency.symbol})` : ''}`;
  }

  get unitPriceLabel(): string {
    const value = Number(this.form.get('default_unit_price')?.value ?? 0);
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  resetFormData(): void {
    this.error = null;
    this.loadCurrencies();
    this.loadItem();
  }

  private loadCurrencies(): void {
    this.http.get<any>(`${environment.apiBaseUrl}/api/currency`).subscribe({
      next: (res) => {
        this.currencies = Array.isArray(res) ? res : res?.list ?? [];
      },
      error: () => {
        this.currencies = [];
      },
    });
  }

  private loadItem(): void {
    if (!this.itemId) return;

    this.loading = true;
    this.error = null;

    this.itemService.get(this.itemId).subscribe({
      next: (item: any) => {
        this.loading = false;
        this.item = item;
        this.form.patchValue(
          {
            item_name: item?.item_name ?? '',
            item_code: item?.item_code ?? '',
            item_details: item?.item_details ?? '',
            default_unit_price: Number(item?.default_unit_price ?? 0),
            default_tax_value: Number(item?.default_tax_value ?? 0),
            currency_code: item?.currency_code ?? 'INR',
          },
          { emitEvent: false }
        );
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load item.');
      },
    });
  }

  update(): void {
    if (!this.itemId) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.error = null;

    const raw = this.form.getRawValue();
    const payload = {
      item_name: String(raw.item_name || '').trim(),
      item_code: String(raw.item_code || '').trim(),
      item_details: String(raw.item_details || '').trim(),
      default_unit_price: Number(raw.default_unit_price ?? 0),
      default_tax_value: Number(raw.default_tax_value ?? 0),
      currency_code: String(raw.currency_code || 'INR').trim() || 'INR',
    };

    this.itemService.update(this.itemId, payload).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/items']);
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to update item.');
      },
    });
  }
}
