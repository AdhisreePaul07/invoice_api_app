import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
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
import { AccountService } from '../../../core/services/account.service';
import { ContactService } from '../../../core/services/contact.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { formatFileSize, validateImageFile } from '../../../core/utils/image-upload.util';
import { ImageUploadFieldComponent } from '../../../shared/components/image-upload-field/image-upload-field.component';

type ContactLite = { id: number; name: string };
type CurrencyLite = { id: number; symbol: string; shortname: string; name: string };

@Component({
  selector: 'app-account-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ImageUploadFieldComponent],
  templateUrl: './accounts-add.component.html',
  styleUrls: ['./accounts-add.component.scss'],
})
export class AccountsAddComponent implements OnInit, OnDestroy {
  form: FormGroup;

  saving = false;
  error: string | null = null;

  readonly taxModelOptions = ['Registered', 'Unregistered', 'Overseas'];
  readonly legalIdentifierTypes = ['CIN', 'LLPIN', 'PAN', 'Registration Number', 'IEC', 'MSME'];
  readonly taxDetailTypes = ['GSTIN', 'VAT', 'TIN', 'Service Tax', 'Sales Tax'];
  readonly trackByIndex = (index: number): number => index;

  contactSearchCtrl = new FormControl<string>('', { nonNullable: true });
  contactDropdownOpen = false;
  contactMaster: ContactLite[] = [];
  contactResults: ContactLite[] = [];
  selectedContacts: ContactLite[] = [];

  currencySearchCtrl = new FormControl<string>('', { nonNullable: true });
  currencyDropdownOpen = false;
  currenciesMaster: CurrencyLite[] = [];
  filteredCurrencies: CurrencyLite[] = [];
  selectedCurrency: CurrencyLite | null = null;
  profileImageFile: File | null = null;
  profileImagePreviewUrl = '';
  profileImageError: string | null = null;
  private profileImageObjectUrl = '';

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private accountService: AccountService,
    private contactService: ContactService,
    private router: Router
  ) {
    this.form = this.fb.group({
      account_name: ['', [Validators.required, Validators.minLength(2)]],
      account_type: [1, [Validators.required]],
      tax_model: [this.taxModelOptions[0], [Validators.required]],
      legal_identifiers: this.fb.array([this.makePairGroup()]),
      tax_detail: this.fb.array([this.makePairGroup()]),
      all_address: this.fb.array([this.makeAddressGroup()]),
      currencies: this.fb.array([]),
      contact_ids: this.fb.control<number[]>([], { nonNullable: true }),
      notes: [''],
    });
  }

  ngOnDestroy(): void {
    this.clearProfileImageDraft();
  }

  ngOnInit(): void {
    this.loadCurrencies();
    this.loadContacts();

    this.currencySearchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((term) => {
        const query = (term || '').trim().toLowerCase();
        this.selectedCurrency = null;
        this.filteredCurrencies = this.filterCurrencies(query).slice(0, query ? 80 : 20);
      });

    this.contactSearchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((term) => {
        this.contactResults = this.computeContactResults(term);
      });
  }

  get accountIdArr(): FormArray {
    return this.form.get('legal_identifiers') as FormArray;
  }

  get taxArr(): FormArray {
    return this.form.get('tax_detail') as FormArray;
  }

  get addrArr(): FormArray {
    return this.form.get('all_address') as FormArray;
  }

  get currencyArr(): FormArray {
    return this.form.get('currencies') as FormArray;
  }

  get pageTitle(): string {
    return String(this.form.get('account_name')?.value || '').trim() || 'New Account';
  }

  get accountTypeLabel(): string {
    return Number(this.form.get('account_type')?.value ?? 1) === 0 ? 'Individual Account' : 'Business Account';
  }

  get linkedContactsDisplay(): string {
    if (this.selectedContacts.length === 0) return 'No contacts linked yet';
    if (this.selectedContacts.length === 1) return this.selectedContacts[0].name;
    if (this.selectedContacts.length === 2) {
      return `${this.selectedContacts[0].name}, ${this.selectedContacts[1].name}`;
    }
    return `${this.selectedContacts[0].name} +${this.selectedContacts.length - 1} more`;
  }

  get primaryAddressDisplay(): string {
    const address = this.toMeaningfulAddresses(this.addrArr.getRawValue() || [])[0];
    return this.formatAddress(address) || 'No address added';
  }

  get notesDisplay(): string {
    return String(this.form.get('notes')?.value ?? '').trim() || 'No notes added';
  }

  get primaryCurrencyLabel(): string {
    const first = (this.currencyArr.getRawValue() || [])[0];
    if (!first?.shortname) return 'No currency selected';
    return `${first.shortname}${first.symbol ? ` (${first.symbol})` : ''}`;
  }

  get profileImageFileName(): string {
    return this.profileImageFile?.name || '';
  }

  get profileImageMeta(): string {
    if (!this.profileImageFile) {
      return '';
    }

    const extension = String(this.profileImageFile.name || '').split('.').pop()?.toUpperCase() || '';
    return [formatFileSize(this.profileImageFile.size), extension].filter(Boolean).join(' | ');
  }

  private makePairGroup(value?: any): FormGroup {
    return this.fb.group({
      type: [value?.type ?? ''],
      value: [value?.value ?? ''],
    });
  }

  private makeAddressGroup(value?: any): FormGroup {
    return this.fb.group({
      Country: [value?.Country ?? 'India'],
      City: [value?.City ?? ''],
      address_line1: [value?.address_line1 ?? ''],
      address_line2: [value?.address_line2 ?? ''],
      county: [value?.county ?? ''],
      pin_code: [value?.pin_code ?? ''],
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

  addAccountId(): void {
    this.accountIdArr.push(this.makePairGroup());
  }

  removeAccountId(index: number): void {
    if (this.accountIdArr.length > 1) this.accountIdArr.removeAt(index);
  }

  addTax(): void {
    this.taxArr.push(this.makePairGroup());
  }

  removeTax(index: number): void {
    if (this.taxArr.length > 1) this.taxArr.removeAt(index);
  }

  addAddress(): void {
    this.addrArr.push(this.makeAddressGroup());
  }

  removeAddress(index: number): void {
    if (this.addrArr.length > 1) this.addrArr.removeAt(index);
  }

  resetFormData(): void {
    this.error = null;
    this.clearProfileImageDraft();
    this.selectedCurrency = null;
    this.selectedContacts = [];
    this.contactSearchCtrl.setValue('', { emitEvent: false });
    this.currencySearchCtrl.setValue('', { emitEvent: false });

    while (this.accountIdArr.length > 1) this.accountIdArr.removeAt(this.accountIdArr.length - 1);
    while (this.taxArr.length > 1) this.taxArr.removeAt(this.taxArr.length - 1);
    while (this.addrArr.length > 1) this.addrArr.removeAt(this.addrArr.length - 1);
    while (this.currencyArr.length) this.currencyArr.removeAt(this.currencyArr.length - 1);

    this.form.reset(
      {
        account_name: '',
        account_type: 1,
        tax_model: this.taxModelOptions[0],
        contact_ids: [],
        notes: '',
      },
      { emitEvent: false }
    );

    this.accountIdArr.at(0)?.patchValue({ type: '', value: '' }, { emitEvent: false });
    this.taxArr.at(0)?.patchValue({ type: '', value: '' }, { emitEvent: false });
    this.addrArr.at(0)?.patchValue(
      {
        Country: 'India',
        City: '',
        address_line1: '',
        address_line2: '',
        county: '',
        pin_code: '',
      },
      { emitEvent: false }
    );

    this.patchContactIds();
    this.filteredCurrencies = this.filterCurrencies('').slice(0, 20);
    this.contactResults = this.computeContactResults('');
  }

  private loadCurrencies(): void {
    this.http.get<CurrencyLite[]>(`${environment.apiBaseUrl}/api/currency`).subscribe({
      next: (response: any) => {
        this.currenciesMaster = Array.isArray(response) ? response : response?.list ?? [];
        this.filteredCurrencies = this.filterCurrencies('').slice(0, 20);
      },
      error: () => {
        this.currenciesMaster = [];
        this.filteredCurrencies = [];
      },
    });
  }

  private filterCurrencies(query: string): CurrencyLite[] {
    const selectedIds = new Set<number>(
      (this.currencyArr.getRawValue() || [])
        .map((item: any) => Number(item?.id))
        .filter((id: number) => !Number.isNaN(id))
    );

    const available = this.currenciesMaster.filter((currency) => !selectedIds.has(Number(currency.id)));
    if (!query) return available;

    return available.filter((currency) =>
      `${currency.shortname} ${currency.symbol} ${currency.name}`.toLowerCase().includes(query)
    );
  }

  openCurrencyDropdown(): void {
    this.currencyDropdownOpen = true;
    this.filteredCurrencies = this.filterCurrencies((this.currencySearchCtrl.value || '').trim().toLowerCase()).slice(0, 20);
  }

  closeCurrencyDropdownSoon(): void {
    setTimeout(() => {
      this.currencyDropdownOpen = false;
    }, 150);
  }

  selectCurrencyFromDropdown(currency: CurrencyLite): void {
    this.selectedCurrency = currency;
    this.currencyDropdownOpen = false;
    this.currencySearchCtrl.setValue(`${currency.shortname} - ${currency.name}`, { emitEvent: false });
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
    this.filteredCurrencies = this.filterCurrencies((this.currencySearchCtrl.value || '').trim().toLowerCase()).slice(0, 20);
  }

  private loadContacts(): void {
    this.contactService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.list) ? res.list : [];
        this.contactMaster = list.map((contact: any) => ({
          id: Number(contact.id),
          name:
            `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
            String(contact.primary_email || '(No name)'),
        }));
        this.contactResults = this.computeContactResults('');
      },
      error: () => {
        this.contactMaster = [];
        this.contactResults = [];
      },
    });
  }

  private computeContactResults(term: string): ContactLite[] {
    const query = (term || '').trim().toLowerCase();
    const selectedIds = new Set(this.selectedContacts.map((contact) => contact.id));
    const available = this.contactMaster.filter((contact) => !selectedIds.has(contact.id));

    if (!query) return available.slice(0, 10);

    return available
      .filter((contact) => contact.name.toLowerCase().includes(query))
      .slice(0, 50);
  }

  openContactDropdown(): void {
    this.contactDropdownOpen = true;
    this.contactResults = this.computeContactResults(this.contactSearchCtrl.value);
  }

  closeContactDropdownSoon(): void {
    setTimeout(() => {
      this.contactDropdownOpen = false;
    }, 150);
  }

  selectContact(contact: ContactLite): void {
    if (!this.selectedContacts.some((entry) => entry.id === contact.id)) {
      this.selectedContacts = [...this.selectedContacts, contact];
    }

    this.patchContactIds();
    this.contactSearchCtrl.setValue('', { emitEvent: true });
    this.contactDropdownOpen = false;
  }

  removeContact(index: number): void {
    this.selectedContacts = this.selectedContacts.filter((_, idx) => idx !== index);
    this.patchContactIds();
    this.contactResults = this.computeContactResults(this.contactSearchCtrl.value);
  }

  private patchContactIds(): void {
    this.form.get('contact_ids')?.setValue(this.selectedContacts.map((contact) => contact.id), { emitEvent: false });
  }

  goToAddContact(): void {
    this.contactDropdownOpen = false;
    void this.router.navigate(['/contacts/add']);
  }

  onProfileImageSelected(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.profileImageError = validationError;
      return;
    }

    this.profileImageError = null;
    this.revokeProfileImageObjectUrl();
    this.profileImageFile = file;
    this.profileImageObjectUrl = URL.createObjectURL(file);
    this.profileImagePreviewUrl = this.profileImageObjectUrl;
  }

  removeProfileImageSelection(): void {
    this.clearProfileImageDraft();
  }

  private toMeaningfulAddresses(addresses: any[]): any[] {
    return (addresses || [])
      .map((address: any) => ({
        Country: String(address?.Country ?? '').trim(),
        City: String(address?.City ?? '').trim(),
        address_line1: String(address?.address_line1 ?? '').trim(),
        address_line2: String(address?.address_line2 ?? '').trim(),
        county: String(address?.county ?? '').trim(),
        pin_code: String(address?.pin_code ?? '').trim(),
      }))
      .filter((address: any) =>
        [address.Country, address.City, address.address_line1, address.address_line2, address.county, address.pin_code].some(Boolean)
      );
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

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.error = null;

    const raw = this.form.getRawValue();
    const allAddress = this.toMeaningfulAddresses(raw.all_address ?? []);
    const primaryAddress = allAddress[0] ?? {};

    const payload = {
      account_name: String(raw.account_name || '').trim(),
      account_type: Number(raw.account_type ?? 1),
      tax_model: String(raw.tax_model || '').trim(),
      legal_identifiers: (raw.legal_identifiers ?? []).filter((item: any) => item?.type && item?.value),
      tax_detail: (raw.tax_detail ?? []).filter((item: any) => item?.type && item?.value),
      primary_address: primaryAddress,
      all_address: allAddress,
      currencies: (raw.currencies ?? []).map((currency: any) => ({
        id: currency?.id ?? null,
        symbol: String(currency?.symbol ?? '').trim(),
        shortname: String(currency?.shortname ?? '').trim(),
        name: String(currency?.name ?? '').trim(),
      })),
      contact_ids: raw.contact_ids ?? [],
      notes: String(raw.notes ?? '').trim(),
      tax_type: [],
    };

    this.accountService.add(payload).subscribe({
      next: (created: any) => {
        const createdId = Number(created?.id ?? 0);
        if (this.profileImageFile && createdId > 0) {
          this.accountService.uploadProfileImage(createdId, this.profileImageFile).subscribe({
            next: () => {
              this.saving = false;
              this.clearProfileImageDraft();
              void this.router.navigate(['/accounts']);
            },
            error: () => {
              this.saving = false;
              this.clearProfileImageDraft();
              void this.router.navigate(['/accounts/edit', createdId], {
                queryParams: { imageUpload: 'failed' },
              });
            },
          });
          return;
        }

        this.saving = false;
        this.clearProfileImageDraft();
        void this.router.navigate(['/accounts']);
      },
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err, 'Failed to create account.');
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.search-select')) {
      this.currencyDropdownOpen = false;
      this.contactDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.currencyDropdownOpen = false;
    this.contactDropdownOpen = false;
  }

  private clearProfileImageDraft(): void {
    this.revokeProfileImageObjectUrl();
    this.profileImageFile = null;
    this.profileImagePreviewUrl = '';
    this.profileImageError = null;
  }

  private revokeProfileImageObjectUrl(): void {
    if (this.profileImageObjectUrl) {
      URL.revokeObjectURL(this.profileImageObjectUrl);
      this.profileImageObjectUrl = '';
    }
  }
}
