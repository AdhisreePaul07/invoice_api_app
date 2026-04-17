import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import { ItemService } from '../../../core/services/item.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type CurrencyLite = { shortname: string; symbol: string; name: string };

@Component({
  selector: 'app-item-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './item-add.component.html',
  styleUrls: ['./item-add.component.scss'],
})
export class ItemAddComponent implements OnInit {
  form: FormGroup;
  saving = false;
  error: string | null = null;
  currencies: CurrencyLite[] = [];
  readonly fallbackCurrencies: CurrencyLite[] = [{ shortname: 'INR', symbol: 'Rs', name: 'Indian Rupee' }];

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private itemService: ItemService,
    private router: Router
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
    this.http.get<any>(`${environment.apiBaseUrl}/api/currency`).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : res?.list ?? [];
        this.currencies = list.length ? list : [...this.fallbackCurrencies];
      },
      error: () => {
        this.currencies = [...this.fallbackCurrencies];
      },
    });
  }

  resetFormData(): void {
    this.error = null;
    this.form.reset(
      {
        item_name: '',
        item_code: '',
        item_details: '',
        default_unit_price: 0,
        default_tax_value: 0,
        currency_code: 'INR',
      },
      { emitEvent: false }
    );
  }

  create(): void {
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

    this.itemService.add(payload).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/items']);
      },
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err, 'Failed to create item.');
      },
    });
  }
}
