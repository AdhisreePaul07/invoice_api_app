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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { AccountService } from '../../../core/services/account.service';
import { ContactService } from '../../../core/services/contact.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { formatFileSize, formatImageAssetMeta, imageUrl, validateImageFile } from '../../../core/utils/image-upload.util';

type ContactLite = { id: number; name: string };
type CurrencyLite = { id: number; symbol: string; shortname: string; name: string };
type AccountSectionKey = 'overview' | 'compliance' | 'addresses' | 'currencies' | 'contacts';
type SectionFeedback = { type: 'success' | 'error'; message: string };

@Component({
  selector: 'app-account-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './accounts-edit.component.html',
  styleUrls: ['./accounts-edit.component.scss'],
})
export class AccountsEditComponent implements OnInit {
  private readonly cropViewportSize = 320;
  private readonly cropMaxZoom = 3;
  form: FormGroup;

  loading = false;
  saving = false;
  error: string | null = null;

  accountId = 0;
  account: any | null = null;

  readonly taxModelOptions = ['Registered', 'Unregistered', 'Overseas'];
  readonly legalIdentifierTypes = ['CIN', 'LLPIN', 'PAN', 'Registration Number', 'IEC', 'MSME'];
  readonly taxDetailTypes = ['GSTIN', 'VAT', 'TIN', 'Service Tax', 'Sales Tax'];

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
  profileImageUploading = false;
  profileImageRemoving = false;
  profileImageError: string | null = null;
  profileImageSuccess: string | null = null;
  profileImageModalOpen = false;
  profileImageDraftUrl = '';
  selectedProfileImageFile: File | null = null;
  cropZoom = 1;
  cropMinZoom = 1;
  cropOffsetX = 0;
  cropOffsetY = 0;
  cropImageWidth = 0;
  cropImageHeight = 0;
  cropSaving = false;
  cropPreparing = false;
  straighten = 0;
  isCropDragging = false;
  private cropDragStartX = 0;
  private cropDragStartY = 0;
  private cropStartOffsetX = 0;
  private cropStartOffsetY = 0;
  uploadNotice: string | null = null;
  sectionSaving: Record<AccountSectionKey, boolean> = {
    overview: false,
    compliance: false,
    addresses: false,
    currencies: false,
    contacts: false,
  };
  sectionFeedback: Partial<Record<AccountSectionKey, SectionFeedback>> = {};

  readonly trackByIndex = (index: number): number => index;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private accountService: AccountService,
    private contactService: ContactService
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

  ngOnInit(): void {
    this.accountId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.route.snapshot.queryParamMap.get('imageUpload') === 'failed') {
      this.uploadNotice = 'Account was created, but the profile image upload failed. You can retry it below.';
    }
    this.loadCurrencies();
    this.loadContacts();
    this.loadAccount();

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

  get legalIdentifierArr(): FormArray {
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
    return String(this.form.get('account_name')?.value || '').trim() || 'Account';
  }

  get accountTypeLabel(): string {
    return Number(this.form.get('account_type')?.value ?? 1) === 0 ? 'Individual Account' : 'Business Account';
  }

  get linkedAccountDisplay(): string {
    const candidates = [
      this.account?.linked_account?.account_name,
      this.account?.linked_account_name,
      this.account?.parent_account?.account_name,
      this.account?.parent_account_name,
      Array.isArray(this.account?.account_details) ? this.account.account_details[0]?.account_name : null,
    ];

    const linkedAccount = candidates.find((value) => String(value ?? '').trim());
    return String(linkedAccount ?? '').trim() || 'Not linked yet';
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

  get profileImageUrl(): string {
    return imageUrl(this.account?.profile_image);
  }

  get profileImageFileName(): string {
    return String(this.account?.profile_image?.original_name || '').trim();
  }

  get profileImageMeta(): string {
    return formatImageAssetMeta(this.account?.profile_image);
  }

  get activeProfileImageFileName(): string {
    return this.selectedProfileImageFile?.name || this.profileImageFileName || 'No photo uploaded yet';
  }

  get activeProfileImageMeta(): string {
    if (this.selectedProfileImageFile) {
      const extension = String(this.selectedProfileImageFile.name || '').split('.').pop()?.toUpperCase() || '';
      return [formatFileSize(this.selectedProfileImageFile.size), extension].filter(Boolean).join(' | ');
    }

    return this.profileImageMeta || 'Upload PNG, JPG, WEBP, or SVG up to 5MB.';
  }

  get profileImageActionBusy(): boolean {
    return this.profileImageUploading || this.profileImageRemoving || this.cropSaving || this.cropPreparing;
  }

  get activeProfileImageUrl(): string {
    return this.profileImageDraftUrl || this.profileImageUrl;
  }

  get isCropDraftActive(): boolean {
    return !!this.profileImageDraftUrl;
  }

  get cropButtonLabel(): string {
    if (this.cropPreparing) {
      return 'Opening...';
    }

    return 'Edit';
  }

  get updateButtonLabel(): string {
    if (this.profileImageUploading || this.cropSaving) {
      return 'Updating...';
    }

    return this.profileImageUrl ? 'Update' : 'Upload';
  }

  get cropImageStyle(): Record<string, string> {
    return {
      width: `${this.cropImageWidth}px`,
      height: `${this.cropImageHeight}px`,
      left: `calc(50% + ${this.cropOffsetX}px)`,
      top: `calc(50% + ${this.cropOffsetY}px)`,
      transform: `translate(-50%, -50%) scale(${this.cropZoom}) rotate(${this.straighten}deg)`,
    };
  }

  get imageModalTitle(): string {
    return this.isCropDraftActive ? 'Edit image' : 'Account image';
  }

  get avatarInitials(): string {
    return String(this.pageTitle || 'Account')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((segment) => segment.charAt(0))
      .join('')
      .toUpperCase() || 'AC';
  }

  get isAnySectionSaving(): boolean {
    return Object.values(this.sectionSaving).some(Boolean);
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

  private resetArray(arr: FormArray, items: any[], factory: (value: any) => FormGroup, ensureOne = false): void {
    while (arr.length) arr.removeAt(0);
    (items || []).forEach((item) => arr.push(factory(item)));
    if (ensureOne && arr.length === 0) arr.push(factory({}));
  }

  addLegalIdentifier(): void {
    this.legalIdentifierArr.push(this.makePairGroup());
  }

  removeLegalIdentifier(index: number): void {
    if (this.legalIdentifierArr.length > 1) this.legalIdentifierArr.removeAt(index);
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

  openProfileImageModal(): void {
    this.profileImageModalOpen = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
  }

  closeProfileImageModal(): void {
    this.profileImageModalOpen = false;
    this.cancelCropDraft();
  }

  handleProfileImageFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0);
    if (file) {
      this.prepareProfileImageDraft(file);
    }

    if (input) {
      input.value = '';
    }
  }

  prepareProfileImageDraft(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.profileImageError = validationError;
      this.profileImageSuccess = null;
      this.profileImageModalOpen = true;
      return;
    }

    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.profileImageModalOpen = true;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '').trim();
      if (!result) {
        this.profileImageError = 'Failed to read the selected image.';
        return;
      }

      const image = new Image();
      image.onload = () => {
        const baseScale = Math.max(this.cropViewportSize / image.width, this.cropViewportSize / image.height);
        this.selectedProfileImageFile = file;
        this.profileImageDraftUrl = result;
        this.cropImageWidth = image.width * baseScale;
        this.cropImageHeight = image.height * baseScale;
        this.cropMinZoom = 1;
        this.cropZoom = 1;
        this.cropOffsetX = 0;
        this.cropOffsetY = 0;
        this.straighten = 0;
        this.cropPreparing = false;
      };
      image.onerror = () => {
        this.cropPreparing = false;
        this.profileImageError = 'Failed to load the selected image.';
      };
      image.src = result;
    };
    reader.onerror = () => {
      this.cropPreparing = false;
      this.profileImageError = 'Failed to read the selected image.';
    };
    reader.readAsDataURL(file);
  }

  handleCropAction(): void {
    if (this.isCropDraftActive) {
      this.profileImageError = null;
      this.profileImageSuccess = null;
      return;
    }

    this.prepareExistingProfileImageDraft();
  }

  handleUpdateAction(fileInput: HTMLInputElement): void {
    if (this.isCropDraftActive) {
      this.saveCroppedProfileImage();
      return;
    }

    fileInput.click();
  }

  saveCroppedProfileImage(): void {
    if (!this.selectedProfileImageFile || !this.profileImageDraftUrl) {
      return;
    }

    this.cropSaving = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;

    this.buildCroppedProfileImageFile()
      .then((croppedFile) => {
        this.cropSaving = false;
        this.uploadProfileImage(croppedFile);
      })
      .catch(() => {
        this.cropSaving = false;
        this.profileImageError = 'Failed to crop the selected image.';
      });
  }

  onCropZoomChange(value: string): void {
    const numericValue = Number(value);
    this.cropZoom = Number.isFinite(numericValue) ? Math.max(this.cropMinZoom, Math.min(this.cropMaxZoom, numericValue)) : 1;
    this.clampCropOffsets();
  }

  onCropWheel(event: WheelEvent): void {
    if (!this.profileImageDraftUrl) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    this.cropZoom = Math.max(this.cropMinZoom, Math.min(this.cropMaxZoom, this.cropZoom + delta));
    this.clampCropOffsets();
  }

  onStraightenChange(value: string): void {
    const numericValue = Number(value);
    this.straighten = Number.isFinite(numericValue) ? this.clamp(numericValue, -15, 15) : 0;
  }

  startCropDrag(event: MouseEvent | TouchEvent): void {
    if (!this.profileImageDraftUrl) {
      return;
    }

    const point = this.extractPoint(event);
    this.isCropDragging = true;
    this.cropDragStartX = point.x;
    this.cropDragStartY = point.y;
    this.cropStartOffsetX = this.cropOffsetX;
    this.cropStartOffsetY = this.cropOffsetY;
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    this.handleCropDragMove(event);
  }

  @HostListener('window:touchmove', ['$event'])
  onWindowTouchMove(event: TouchEvent): void {
    this.handleCropDragMove(event);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onWindowDragEnd(): void {
    if (!this.isCropDragging) {
      return;
    }

    this.isCropDragging = false;
  }

  cancelCropDraft(): void {
    this.profileImageDraftUrl = '';
    this.selectedProfileImageFile = null;
    this.cropZoom = 1;
    this.cropMinZoom = 1;
    this.cropOffsetX = 0;
    this.cropOffsetY = 0;
    this.cropImageWidth = 0;
    this.cropImageHeight = 0;
    this.cropPreparing = false;
    this.straighten = 0;
    this.isCropDragging = false;
  }

  removeAddress(index: number): void {
    if (this.addrArr.length > 1) this.addrArr.removeAt(index);
  }

  resetFormData(): void {
    this.error = null;
    this.selectedCurrency = null;
    this.sectionFeedback = {};
    this.currencySearchCtrl.setValue('', { emitEvent: false });
    this.contactSearchCtrl.setValue('', { emitEvent: false });
    this.loadCurrencies();
    this.loadContacts();
    this.loadAccount();
  }

  private loadAccount(showLoader = true): void {
    if (!this.accountId) return;

    if (showLoader) {
      this.loading = true;
    }
    this.error = null;

    this.accountService.get(this.accountId).subscribe({
      next: (account: any) => {
        this.loading = false;
        this.account = account;

        this.form.patchValue(
          {
            account_name: account?.account_name ?? '',
            account_type: Number(account?.account_type ?? 1),
            tax_model: account?.tax_model || this.taxModelOptions[0],
            notes: account?.notes ?? '',
          },
          { emitEvent: false }
        );

        this.resetArray(this.legalIdentifierArr, account?.legal_identifiers ?? [], (value) => this.makePairGroup(value), true);
        this.resetArray(this.taxArr, account?.tax_detail ?? [], (value) => this.makePairGroup(value), true);

        const addresses =
          Array.isArray(account?.all_address) && account.all_address.length
            ? account.all_address
            : account?.primary_address
              ? [account.primary_address]
              : [];
        this.resetArray(this.addrArr, addresses, (value) => this.makeAddressGroup(value), true);

        this.resetArray(this.currencyArr, account?.currencies ?? [], (value) => this.makeCurrencyGroup(value));

        const contactDetails = Array.isArray(account?.contact_details) ? account.contact_details : [];
        const contactIds = Array.isArray(account?.contact_ids) ? account.contact_ids : [];
        if (contactDetails.length) {
          this.selectedContacts = contactDetails.map((contact: any) => ({
            id: Number(contact.id),
            name:
              `${contact.first_name || ''} ${contact.last_name || ''}`.trim() ||
              String(contact.primary_email || '(No name)'),
          }));
        } else if (contactIds.length) {
          this.selectedContacts = contactIds.map((id: number) => {
            const existing = this.contactMaster.find((contact) => contact.id === Number(id));
            return existing || { id: Number(id), name: `Contact #${id}` };
          });
        } else {
          this.selectedContacts = [];
        }

        this.patchContactIds();
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load account.');
      },
    });
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

        this.selectedContacts = this.selectedContacts.map((selected) => {
          const existing = this.contactMaster.find((contact) => contact.id === selected.id);
          return existing || selected;
        });

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

  uploadProfileImage(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.profileImageError = validationError;
      this.profileImageSuccess = null;
      return;
    }

    if (!this.accountId) {
      return;
    }

    this.profileImageUploading = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.uploadNotice = null;

    this.accountService.uploadProfileImage(this.accountId, file).subscribe({
      next: (response) => {
        this.profileImageUploading = false;
        this.account = response?.account || { ...(this.account || {}), profile_image: response?.profile_image || null };
        this.profileImageSuccess = response?.message || 'Account profile image updated successfully.';
        this.cancelCropDraft();
        this.profileImageModalOpen = true;
      },
      error: (error) => {
        this.profileImageUploading = false;
        this.profileImageError = extractApiError(error, 'Failed to update the account profile image.');
        this.profileImageModalOpen = true;
      },
    });
  }

  deleteProfileImage(): void {
    if (this.profileImageDraftUrl) {
      this.cancelCropDraft();
      return;
    }

    if (!this.accountId || !this.profileImageUrl) {
      return;
    }

    this.profileImageRemoving = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.uploadNotice = null;

    this.accountService.deleteProfileImage(this.accountId).subscribe({
      next: (response) => {
        this.profileImageRemoving = false;
        this.account = response?.account || { ...(this.account || {}), profile_image: null };
        this.profileImageSuccess = response?.message || 'Account profile image deleted successfully.';
        this.profileImageModalOpen = true;
      },
      error: (error) => {
        this.profileImageRemoving = false;
        this.profileImageError = extractApiError(error, 'Failed to delete the account profile image.');
        this.profileImageModalOpen = true;
      },
    });
  }

  private async buildCroppedProfileImageFile(): Promise<File> {
    const image = await this.loadImage(this.profileImageDraftUrl);
    const outputSize = 800;
    const exportScale = outputSize / this.cropViewportSize;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas not supported');
    }

    context.save();
    context.translate(outputSize / 2 + this.cropOffsetX * exportScale, outputSize / 2 + this.cropOffsetY * exportScale);
    context.rotate((this.straighten * Math.PI) / 180);
    context.scale((this.cropImageWidth / image.width) * this.cropZoom * exportScale, (this.cropImageHeight / image.height) * this.cropZoom * exportScale);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    context.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error('Failed to export image'));
      }, 'image/png');
    });

    return new File([blob], this.buildCroppedFileName(this.selectedProfileImageFile?.name), { type: 'image/png' });
  }

  private buildCroppedFileName(originalName: string | null | undefined): string {
    const baseName = String(originalName || 'account-image')
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    return `${baseName || 'account-image'}-cropped.png`;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });
  }

  private prepareExistingProfileImageDraft(): void {
    if (!this.profileImageUrl) {
      return;
    }

    this.cropPreparing = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.profileImageModalOpen = true;

    fetch(this.profileImageUrl, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch current image');
        }

        return response.blob();
      })
      .then((blob) => {
        const fileType = blob.type || this.account?.profile_image?.content_type || 'image/png';
        const fileName = this.profileImageFileName || 'account-image.png';
        this.prepareProfileImageDraft(new File([blob], fileName, { type: fileType }));
      })
      .catch(() => {
        this.cropPreparing = false;
        this.profileImageError = 'Failed to load the current account image for editing.';
      });
  }

  private handleCropDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.isCropDragging || !this.profileImageDraftUrl) {
      return;
    }

    if ('cancelable' in event && event.cancelable) {
      event.preventDefault();
    }

    const point = this.extractPoint(event);
    this.cropOffsetX = this.cropStartOffsetX + (point.x - this.cropDragStartX);
    this.cropOffsetY = this.cropStartOffsetY + (point.y - this.cropDragStartY);
    this.clampCropOffsets();
  }

  private clampCropOffsets(): void {
    const scaledWidth = this.cropImageWidth * this.cropZoom;
    const scaledHeight = this.cropImageHeight * this.cropZoom;
    const maxOffsetX = Math.max(0, (scaledWidth - this.cropViewportSize) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - this.cropViewportSize) / 2);

    this.cropOffsetX = this.clamp(this.cropOffsetX, -maxOffsetX, maxOffsetX);
    this.cropOffsetY = this.clamp(this.cropOffsetY, -maxOffsetY, maxOffsetY);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private extractPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
    if ('touches' in event && event.touches.length) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    if ('changedTouches' in event && event.changedTouches.length) {
      return {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY,
      };
    }

    return {
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    };
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

  private buildOverviewPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      account_name: String(raw.account_name || '').trim(),
      account_type: Number(raw.account_type ?? 1),
      currencies: (raw.currencies ?? []).map((currency: any) => ({
        id: currency?.id ?? null,
        symbol: String(currency?.symbol ?? '').trim(),
        shortname: String(currency?.shortname ?? '').trim(),
        name: String(currency?.name ?? '').trim(),
      })),
    };
  }

  private buildCompliancePayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      tax_model: String(raw.tax_model || '').trim(),
      legal_identifiers: (raw.legal_identifiers ?? []).filter((item: any) => item?.type && item?.value),
      tax_detail: (raw.tax_detail ?? []).filter((item: any) => item?.type && item?.value),
    };
  }

  private buildAddressPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    const allAddress = this.toMeaningfulAddresses(raw.all_address ?? []);
    const primaryAddress = allAddress[0] ?? {};
    return {
      primary_address: primaryAddress,
      all_address: allAddress,
      notes: String(raw.notes ?? '').trim(),
    };
  }

  private buildCurrencyPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      currencies: (raw.currencies ?? []).map((currency: any) => ({
        id: currency?.id ?? null,
        symbol: String(currency?.symbol ?? '').trim(),
        shortname: String(currency?.shortname ?? '').trim(),
        name: String(currency?.name ?? '').trim(),
      })),
    };
  }

  private buildContactPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      contact_ids: raw.contact_ids ?? [],
    };
  }

  private updateSection(section: AccountSectionKey, payload: Record<string, unknown>, successMessage: string): void {
    if (!this.accountId) return;

    this.sectionSaving[section] = true;
    delete this.sectionFeedback[section];
    this.error = null;

    this.accountService.update(this.accountId, payload).subscribe({
      next: () => {
        this.sectionSaving[section] = false;
        this.sectionFeedback[section] = { type: 'success', message: successMessage };
        this.loadAccount(false);
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
    const controls = ['account_name', 'account_type'];
    const hasInvalidControl = controls.some((name) => this.form.get(name)?.invalid);
    if (hasInvalidControl) {
      controls.forEach((name) => this.form.get(name)?.markAsTouched());
      return;
    }

    this.updateSection('overview', this.buildOverviewPayload(), 'Account details and currency updated successfully.');
  }

  saveComplianceSection(): void {
    this.updateSection('compliance', this.buildCompliancePayload(), 'Tax and compliance details updated successfully.');
  }

  saveAddressesSection(): void {
    this.updateSection('addresses', this.buildAddressPayload(), 'Addresses and notes updated successfully.');
  }

  saveCurrenciesSection(): void {
    this.updateSection('currencies', this.buildCurrencyPayload(), 'Currency settings updated successfully.');
  }

  saveContactsSection(): void {
    this.updateSection('contacts', this.buildContactPayload(), 'Linked contacts updated successfully.');
  }

  feedbackFor(section: AccountSectionKey): SectionFeedback | null {
    return this.sectionFeedback[section] ?? null;
  }
}
