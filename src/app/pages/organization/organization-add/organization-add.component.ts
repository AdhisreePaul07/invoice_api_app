import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { OrganizationService } from '../../../core/services/organization.service';
import { OrgStateService } from '../../../core/services/org-state.service';

type Currency = { id: number; symbol: string; shortname: string; name: string };

@Component({
  selector: 'app-organization-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './organization-add.component.html',
  styleUrls: ['./organization-add.component.scss'],
})
export class OrganizationAddComponent implements OnInit {
  form: FormGroup;

  saving = false;
  error: string | null = null;

  orgTypeOpen = false;
  orgIdTypeOpenIndex: number | null = null;
  taxTypeOpenIndex: number | null = null;

  orgIdTypeOptions: string[] = [
    'CIN',
    'LLPIN',
    'Udyam (MSME)',
    'Import Export Code',
    'Firm Registration No.',
    'Trade License',
    'PT Registration No.',
  ];

  taxTypeOptions: string[] = ['GSTIN', 'PAN', 'TAN', 'LUT'];

  currencySearchCtrl = new FormControl<string>('', { nonNullable: true });
  currencyDropdownOpen = false;
  currenciesMaster: Currency[] = [];
  filteredCurrencies: Currency[] = [];
  selectedCurrency: Currency | null = null;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private orgService: OrganizationService,
    private orgState: OrgStateService,
    private router: Router
  ) {
    this.form = this.fb.group({
      org_name: ['', [Validators.required, Validators.minLength(2)]],
      org_type: [1, [Validators.required]],
      org_id: this.fb.array([this.makePairGroup()]),
      tax_detail: this.fb.array([this.makePairGroup()]),
      address: this.makeAddressGroup(),
      currencies: this.fb.array([]),
    });
  }

  ngOnInit(): void {
    this.loadCurrencies();

    this.currencySearchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((term) => {
        const q = (term || '').trim().toLowerCase();
        this.selectedCurrency = null;

        if (!q) {
          this.filteredCurrencies = this.currenciesMaster.slice(0, 20);
          return;
        }

        this.filteredCurrencies = this.currenciesMaster
          .filter((currency) =>
            `${currency.shortname} ${currency.symbol} ${currency.name}`.toLowerCase().includes(q)
          )
          .slice(0, 50);
      });
  }

  get orgIdArr(): FormArray {
    return this.form.get('org_id') as FormArray;
  }

  get taxArr(): FormArray {
    return this.form.get('tax_detail') as FormArray;
  }

  get currencyArr(): FormArray {
    return this.form.get('currencies') as FormArray;
  }

  private makePairGroup(value?: any): FormGroup {
    return this.fb.group({
      type: [value?.type ?? '', Validators.required],
      value: [value?.value ?? '', Validators.required],
    });
  }

  private makeAddressGroup(value?: any): FormGroup {
    return this.fb.group({
      country: [value?.country ?? '', Validators.required],
      address_line1: [value?.address_line1 ?? '', Validators.required],
      address_line2: [value?.address_line2 ?? ''],
      city: [value?.city ?? '', Validators.required],
      pin_code: [value?.pin_code ?? ''],
      state: [value?.state ?? ''],
    });
  }

  private makeCurrencyGroup(value?: any): FormGroup {
    return this.fb.group({
      id: [value?.id ?? null, Validators.required],
      symbol: [value?.symbol ?? '', Validators.required],
      shortname: [value?.shortname ?? '', Validators.required],
      name: [value?.name ?? '', Validators.required],
    });
  }

  private planCodeFromSelection(value: number): string {
    switch (value) {
      case 0:
        return 'starter';
      case 2:
        return 'enterprise';
      case 1:
      default:
        return 'growth';
    }
  }

  private normalizeAddress(value: any): any {
    return {
      Country: String(value?.country ?? value?.Country ?? '').trim(),
      City: String(value?.city ?? value?.City ?? '').trim(),
      address_line1: String(value?.address_line1 ?? '').trim(),
      address_line2: String(value?.address_line2 ?? '').trim(),
      county: String(value?.state ?? value?.county ?? '').trim(),
      pin_code: String(value?.pin_code ?? '').trim(),
    };
  }

  toggleOrgType(): void {
    this.orgTypeOpen = !this.orgTypeOpen;
    if (this.orgTypeOpen) {
      this.currencyDropdownOpen = false;
      this.orgIdTypeOpenIndex = null;
      this.taxTypeOpenIndex = null;
    }
  }

  setOrgType(value: 0 | 1 | 2): void {
    this.form.patchValue({ org_type: value });
    this.form.get('org_type')?.markAsTouched();
    this.orgTypeOpen = false;
  }

  getOrgTypeLabel(): string {
    const value = this.form.get('org_type')?.value;
    if (value === 0) return 'Starter';
    if (value === 1) return 'Growth';
    if (value === 2) return 'Enterprise';
    return 'Select plan';
  }

  toggleOrgIdType(index: number): void {
    this.orgIdTypeOpenIndex = this.orgIdTypeOpenIndex === index ? null : index;
    if (this.orgIdTypeOpenIndex !== null) {
      this.taxTypeOpenIndex = null;
      this.orgTypeOpen = false;
      this.currencyDropdownOpen = false;
    }
  }

  setOrgIdType(index: number, type: string): void {
    this.orgIdArr.at(index).patchValue({ type });
    this.orgIdArr.at(index).get('type')?.markAsTouched();
    this.orgIdTypeOpenIndex = null;
  }

  getAvailableOrgIdTypes(rowIndex: number): string[] {
    const used = new Set(this.selectedTypesFromFormArray(this.orgIdArr, rowIndex));
    const current = String(this.orgIdArr.at(rowIndex)?.get('type')?.value || '').trim();
    return this.orgIdTypeOptions.filter((option) => option === current || !used.has(option));
  }

  toggleTaxType(index: number): void {
    this.taxTypeOpenIndex = this.taxTypeOpenIndex === index ? null : index;
    if (this.taxTypeOpenIndex !== null) {
      this.orgIdTypeOpenIndex = null;
      this.orgTypeOpen = false;
      this.currencyDropdownOpen = false;
    }
  }

  setTaxType(index: number, type: string): void {
    this.taxArr.at(index).patchValue({ type });
    this.taxArr.at(index).get('type')?.markAsTouched();
    this.taxTypeOpenIndex = null;
  }

  getAvailableTaxTypes(rowIndex: number): string[] {
    const used = new Set(this.selectedTypesFromFormArray(this.taxArr, rowIndex));
    const current = String(this.taxArr.at(rowIndex)?.get('type')?.value || '').trim();
    return this.taxTypeOptions.filter((option) => option === current || !used.has(option));
  }

  private selectedTypesFromFormArray(arr: FormArray, excludeIndex: number): string[] {
    return (arr.getRawValue() || [])
      .map((item: any) => String(item?.type || '').trim())
      .filter((type: string, index: number) => !!type && index !== excludeIndex);
  }

  addOrgId(): void {
    this.orgIdArr.push(this.makePairGroup());
    this.orgIdTypeOpenIndex = this.orgIdArr.length - 1;
    this.taxTypeOpenIndex = null;
  }

  removeOrgId(index: number): void {
    if (this.orgIdArr.length > 1) this.orgIdArr.removeAt(index);
    if (this.orgIdTypeOpenIndex === index) this.orgIdTypeOpenIndex = null;
  }

  addTax(): void {
    this.taxArr.push(this.makePairGroup());
    this.taxTypeOpenIndex = this.taxArr.length - 1;
    this.orgIdTypeOpenIndex = null;
  }

  removeTax(index: number): void {
    if (this.taxArr.length > 1) this.taxArr.removeAt(index);
    if (this.taxTypeOpenIndex === index) this.taxTypeOpenIndex = null;
  }

  private loadCurrencies(): void {
    this.http.get<Currency[]>(`${environment.apiBaseUrl}/api/currency`).subscribe({
      next: (res) => {
        this.currenciesMaster = Array.isArray(res) ? res : [];
        this.filteredCurrencies = this.currenciesMaster.slice(0, 20);
      },
      error: () => {
        this.currenciesMaster = [];
        this.filteredCurrencies = [];
      },
    });
  }

  openCurrency(): void {
    this.currencyDropdownOpen = true;
    this.orgTypeOpen = false;
    this.orgIdTypeOpenIndex = null;
    this.taxTypeOpenIndex = null;

    if (!this.currencySearchCtrl.value?.trim()) {
      this.filteredCurrencies = this.currenciesMaster.slice(0, 20);
    }
  }

  selectCurrencyFromDropdown(currency: Currency): void {
    this.selectedCurrency = currency;
    this.currencyDropdownOpen = false;
    this.currencySearchCtrl.setValue(`${currency.shortname} - ${currency.name}`, { emitEvent: false });
  }

  addSelectedCurrency(): void {
    if (!this.selectedCurrency) return;

    const exists = this.currencyArr.getRawValue().some((item: any) => item.id === this.selectedCurrency!.id);
    if (!exists) this.currencyArr.push(this.makeCurrencyGroup(this.selectedCurrency));

    this.currencySearchCtrl.setValue('', { emitEvent: true });
    this.selectedCurrency = null;
    this.filteredCurrencies = this.currenciesMaster.slice(0, 20);
  }

  removeCurrency(index: number): void {
    this.currencyArr.removeAt(index);
  }

  closeCurrencyDropdownSoon(): void {
    setTimeout(() => {
      this.currencyDropdownOpen = false;
    }, 150);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.search-select') && !target.closest('.search-select.selectlike')) {
      this.orgTypeOpen = false;
      this.currencyDropdownOpen = false;
      this.orgIdTypeOpenIndex = null;
      this.taxTypeOpenIndex = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.orgTypeOpen = false;
    this.currencyDropdownOpen = false;
    this.orgIdTypeOpenIndex = null;
    this.taxTypeOpenIndex = null;
  }

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.error = null;

    const raw = this.form.getRawValue();
    const normalizedAddress = this.normalizeAddress(raw.address || null);

    const payload = {
      org_name: String(raw.org_name || '').trim(),
      plan_code: this.planCodeFromSelection(raw.org_type),
      legal_identifiers: (raw.org_id ?? []).filter((item: any) => item?.type && item?.value),
      tax_detail: (raw.tax_detail ?? []).filter((item: any) => item?.type && item?.value),
      primary_address: normalizedAddress,
      all_address: normalizedAddress?.address_line1 ? [normalizedAddress] : [],
      brand_settings: {},
      invoice_settings: {},
      currency_settings: {
        currencies: raw.currencies ?? [],
      },
    };

    this.orgService.add(payload).subscribe({
      next: (response: any) => {
        this.saving = false;
        const organization = response?.data ?? response?.organization ?? response;

        if (organization) {
          this.orgState.setOrg(organization);
          void this.router.navigate(['/organizations']);
          return;
        }

        this.orgState.refresh().subscribe(() => {
          void this.router.navigate(['/organizations']);
        });
      },
      error: (err) => {
        this.saving = false;

        const message =
          err?.error?.message ||
          err?.error?.detail ||
          'Failed to create organization.';

        if (String(message).toLowerCase().includes('only one organization')) {
          this.error = 'Organization already exists. You cannot create another.';
          void this.router.navigate(['/organizations']);
          return;
        }

        this.error = message;
      },
    });
  }
}
