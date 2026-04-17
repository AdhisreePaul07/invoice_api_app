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
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { OrganizationService } from '../../../core/services/organization.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type Currency = { id: number; symbol: string; shortname: string; name: string };
type OrganizationSectionKey = 'overview' | 'compliance' | 'settings';
type SectionFeedback = { type: 'success' | 'error'; message: string };

@Component({
  selector: 'app-organization-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './organization-edit.component.html',
  styleUrls: ['./organization-edit.component.scss'],
})
export class OrganizationEditComponent implements OnInit {
  form: FormGroup;

  loading = false;
  error: string | null = null;

  orgId = 0;
  organization: any | null = null;

  readonly legalIdentifierTypes: string[] = [
    'CIN',
    'LLPIN',
    'Udyam (MSME)',
    'Import Export Code',
    'Firm Registration No.',
    'Trade License',
    'PT Registration No.',
  ];

  readonly taxDetailTypes: string[] = ['GSTIN', 'PAN', 'TAN', 'LUT'];

  readonly planOptions: Array<{ value: 0 | 1 | 2; label: string }> = [
    { value: 0, label: 'Starter' },
    { value: 1, label: 'Growth' },
    { value: 2, label: 'Enterprise' },
  ];

  currencySearchCtrl = new FormControl<string>('', { nonNullable: true });
  currencyDropdownOpen = false;
  currenciesMaster: Currency[] = [];
  filteredCurrencies: Currency[] = [];
  selectedCurrency: Currency | null = null;

  sectionSaving: Record<OrganizationSectionKey, boolean> = {
    overview: false,
    compliance: false,
    settings: false,
  };
  sectionFeedback: Partial<Record<OrganizationSectionKey, SectionFeedback>> = {};

  readonly trackByIndex = (index: number): number => index;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private http: HttpClient,
    private orgService: OrganizationService
  ) {
    this.form = this.fb.group({
      org_name: ['', [Validators.required, Validators.minLength(2)]],
      org_type: [1, [Validators.required]],
      org_id: this.fb.array([]),
      tax_detail: this.fb.array([]),
      address: this.fb.group({
        Country: ['India'],
        address_line1: [''],
        address_line2: [''],
        city: [''],
        state: [''],
        pin_code: [''],
      }),
      currencies: this.fb.array([]),
    });
  }

  ngOnInit(): void {
    this.orgId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadCurrencies();
    this.loadOrganization();

    this.currencySearchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((term) => {
        const query = (term || '').trim().toLowerCase();
        this.selectedCurrency = null;
        this.filteredCurrencies = this.filterCurrencies(query).slice(0, query ? 80 : 20);
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

  get addressGroup(): FormGroup {
    return this.form.get('address') as FormGroup;
  }

  get pageTitle(): string {
    return String(this.form.get('org_name')?.value || '').trim() || 'Organization';
  }

  get planLabel(): string {
    return this.getPlanLabelFromValue(this.form.get('org_type')?.value);
  }

  get primaryAddressDisplay(): string {
    return this.formatAddress(this.normalizeAddress(this.addressGroup.getRawValue())) || 'No address added';
  }

  get primaryCurrencyLabel(): string {
    const first = (this.currencyArr.getRawValue() || [])[0];
    if (!first?.shortname) return 'No currency selected';
    return `${first.shortname}${first.symbol ? ` (${first.symbol})` : ''}`;
  }

  get legalIdentifierCount(): number {
    return this.countMeaningfulPairs(this.orgIdArr.getRawValue() || []);
  }

  get taxDetailCount(): number {
    return this.countMeaningfulPairs(this.taxArr.getRawValue() || []);
  }

  get organizationUid(): string {
    return String(this.organization?.uid || '').trim() || 'Not available';
  }

  get organizationSlug(): string {
    return String(this.organization?.org_slug || '').trim() || 'Not available';
  }

  get isAnySectionSaving(): boolean {
    return Object.values(this.sectionSaving).some(Boolean);
  }

  private loadOrganization(showLoader = true): void {
    if (!this.orgId) return;

    if (showLoader) {
      this.loading = true;
    }
    this.error = null;

    this.orgService.get(this.orgId).subscribe({
      next: (org: any) => {
        this.loading = false;
        this.organization = org;

        this.form.patchValue(
          {
            org_name: org?.org_name ?? '',
            org_type: this.selectionFromPlanCode(org?.plan_code),
          },
          { emitEvent: false }
        );

        this.resetArray(this.orgIdArr, org?.legal_identifiers ?? [], (value) =>
          this.makePairGroup(value)
        );
        this.resetArray(this.taxArr, org?.tax_detail ?? [], (value) =>
          this.makePairGroup(value)
        );
        this.resetArray(
          this.currencyArr,
          org?.currency_settings?.currencies ?? [],
          (value) => this.makeCurrencyGroup(value)
        );

        const address =
          org?.primary_address ||
          (Array.isArray(org?.all_address) ? org.all_address[0] : null) ||
          {};

        this.addressGroup.patchValue(
          {
            Country: address?.Country ?? address?.country ?? 'India',
            address_line1: address?.address_line1 ?? '',
            address_line2: address?.address_line2 ?? '',
            city: address?.City ?? address?.city ?? '',
            state: address?.county ?? address?.state ?? '',
            pin_code: address?.pin_code ?? '',
          },
          { emitEvent: false }
        );

        this.selectedCurrency = null;
        this.currencySearchCtrl.setValue('', { emitEvent: false });
        this.filteredCurrencies = this.filterCurrencies('').slice(0, 20);
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load organization.');
      },
    });
  }

  private selectionFromPlanCode(planCode: string | null | undefined): 0 | 1 | 2 {
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

  private getPlanLabelFromValue(value: any): string {
    if (value === 0) return 'Starter';
    if (value === 2) return 'Enterprise';
    return 'Growth';
  }

  private makePairGroup(value?: any): FormGroup {
    return this.fb.group({
      type: [value?.type ?? ''],
      value: [value?.value ?? ''],
    });
  }

  private makeCurrencyGroup(value?: any): FormGroup {
    return this.fb.group({
      id: [value?.id ?? null],
      symbol: [value?.symbol ?? ''],
      shortname: [value?.shortname ?? ''],
      name: [value?.name ?? ''],
    });
  }

  private resetArray(arr: FormArray, items: any[], factory: (value: any) => FormGroup): void {
    while (arr.length) arr.removeAt(0);
    (items || []).forEach((item) => arr.push(factory(item)));
  }

  addOrgId(): void {
    this.orgIdArr.push(this.makePairGroup());
  }

  removeOrgId(index: number): void {
    this.orgIdArr.removeAt(index);
  }

  addTax(): void {
    this.taxArr.push(this.makePairGroup());
  }

  removeTax(index: number): void {
    this.taxArr.removeAt(index);
  }

  resetFormData(): void {
    this.error = null;
    this.selectedCurrency = null;
    this.sectionFeedback = {};
    this.currencySearchCtrl.setValue('', { emitEvent: false });
    this.loadCurrencies();
    this.loadOrganization();
  }

  private normalizeAddress(value: any): any {
    return {
      Country: String(value?.Country ?? value?.country ?? '').trim(),
      City: String(value?.city ?? value?.City ?? '').trim(),
      address_line1: String(value?.address_line1 ?? '').trim(),
      address_line2: String(value?.address_line2 ?? '').trim(),
      county: String(value?.state ?? value?.county ?? '').trim(),
      pin_code: String(value?.pin_code ?? '').trim(),
    };
  }

  private formatAddress(address: any): string {
    if (!address) return '';

    return [
      String(address?.address_line1 ?? '').trim(),
      String(address?.address_line2 ?? '').trim(),
      String(address?.City ?? '').trim(),
      String(address?.county ?? '').trim(),
      String(address?.pin_code ?? '').trim(),
      String(address?.Country ?? '').trim(),
    ]
      .filter(Boolean)
      .join(', ');
  }

  private countMeaningfulPairs(items: any[]): number {
    return (items || []).filter(
      (item: any) =>
        String(item?.type ?? '').trim() && String(item?.value ?? '').trim()
    ).length;
  }

  private buildOverviewPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      org_name: String(raw.org_name || '').trim(),
      plan_code: this.planCodeFromSelection(Number(raw.org_type ?? 1)),
    };
  }

  private buildCompliancePayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      legal_identifiers: (raw.org_id ?? []).filter(
        (item: any) =>
          String(item?.type ?? '').trim() && String(item?.value ?? '').trim()
      ),
      tax_detail: (raw.tax_detail ?? []).filter(
        (item: any) =>
          String(item?.type ?? '').trim() && String(item?.value ?? '').trim()
      ),
    };
  }

  private buildSettingsPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    const address = this.normalizeAddress(raw.address || null);
    const hasAddress = Object.values(address).some((value) => String(value ?? '').trim());

    return {
      primary_address: hasAddress ? address : {},
      all_address: hasAddress ? [address] : [],
      currency_settings: {
        currencies: (raw.currencies ?? []).map((currency: any) => ({
          id: currency?.id ?? null,
          symbol: String(currency?.symbol ?? '').trim(),
          shortname: String(currency?.shortname ?? '').trim(),
          name: String(currency?.name ?? '').trim(),
        })),
      },
    };
  }

  private updateSection(
    section: OrganizationSectionKey,
    payload: Record<string, unknown>,
    successMessage: string
  ): void {
    if (!this.orgId) return;

    this.sectionSaving[section] = true;
    delete this.sectionFeedback[section];
    this.error = null;

    this.orgService.update(this.orgId, payload).subscribe({
      next: () => {
        this.sectionSaving[section] = false;
        this.sectionFeedback[section] = { type: 'success', message: successMessage };
        this.loadOrganization(false);
      },
      error: (error) => {
        this.sectionSaving[section] = false;
        this.sectionFeedback[section] = {
          type: 'error',
          message: extractApiError(error, 'Failed to update this section.'),
        };
      },
    });
  }

  saveOverviewSection(): void {
    const controls = ['org_name', 'org_type'];
    const hasInvalidControl = controls.some((name) => this.form.get(name)?.invalid);
    if (hasInvalidControl) {
      controls.forEach((name) => this.form.get(name)?.markAsTouched());
      return;
    }

    this.updateSection(
      'overview',
      this.buildOverviewPayload(),
      'Organization details updated successfully.'
    );
  }

  saveComplianceSection(): void {
    this.updateSection(
      'compliance',
      this.buildCompliancePayload(),
      'Organization identifiers and tax details updated successfully.'
    );
  }

  saveSettingsSection(): void {
    this.updateSection(
      'settings',
      this.buildSettingsPayload(),
      'Organization address and currency settings updated successfully.'
    );
  }

  feedbackFor(section: OrganizationSectionKey): SectionFeedback | null {
    return this.sectionFeedback[section] ?? null;
  }

  private loadCurrencies(): void {
    this.http.get<any>(`${environment.apiBaseUrl}/api/currency`).subscribe({
      next: (response) => {
        const list = Array.isArray(response) ? response : response?.list ?? [];
        this.currenciesMaster = (list as Currency[]).slice();
        this.filteredCurrencies = this.filterCurrencies('').slice(0, 20);
      },
      error: () => {
        this.currenciesMaster = [];
        this.filteredCurrencies = [];
      },
    });
  }

  private filterCurrencies(query: string): Currency[] {
    const selectedIds = new Set<number>(
      (this.currencyArr.getRawValue() || [])
        .map((item: any) => Number(item?.id))
        .filter((id: number) => !Number.isNaN(id))
    );

    const available = this.currenciesMaster.filter(
      (currency) => !selectedIds.has(Number(currency.id))
    );
    if (!query) return available;

    return available.filter((currency) =>
      `${currency.shortname} ${currency.symbol} ${currency.name}`
        .toLowerCase()
        .includes(query)
    );
  }

  openCurrencyDropdown(): void {
    this.currencyDropdownOpen = true;
    this.filteredCurrencies = this.filterCurrencies(
      (this.currencySearchCtrl.value || '').trim().toLowerCase()
    ).slice(0, 20);
  }

  closeCurrencyDropdownSoon(): void {
    setTimeout(() => {
      this.currencyDropdownOpen = false;
    }, 150);
  }

  selectCurrencyFromDropdown(currency: Currency): void {
    this.selectedCurrency = currency;
    this.currencyDropdownOpen = false;
    this.currencySearchCtrl.setValue(`${currency.shortname} - ${currency.name}`, {
      emitEvent: false,
    });
  }

  addSelectedCurrency(): void {
    if (!this.selectedCurrency) return;

    const exists = (this.currencyArr.getRawValue() || []).some(
      (item: any) => Number(item?.id) === Number(this.selectedCurrency?.id)
    );

    if (!exists) {
      this.currencyArr.push(this.makeCurrencyGroup(this.selectedCurrency));
    }

    this.currencySearchCtrl.setValue('', { emitEvent: true });
    this.selectedCurrency = null;
    this.filteredCurrencies = this.filterCurrencies('').slice(0, 20);
  }

  removeCurrency(index: number): void {
    this.currencyArr.removeAt(index);
    this.filteredCurrencies = this.filterCurrencies(
      (this.currencySearchCtrl.value || '').trim().toLowerCase()
    ).slice(0, 20);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.search-select')) {
      this.currencyDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.currencyDropdownOpen = false;
  }
}
