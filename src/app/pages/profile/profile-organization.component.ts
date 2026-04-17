import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { tap } from 'rxjs';

import { AccountProfile } from '../../core/models/auth.model';
import { CurrencyOption, Organization } from '../../core/models/organization.model';
import { AuthService } from '../../core/services/auth.service';
import { OrgStateService } from '../../core/services/org-state.service';
import { OrganizationService } from '../../core/services/organization.service';
import { extractApiError } from '../../core/utils/api-error.util';
import { formatFileSize, formatImageAssetMeta, imageUrl, validateImageFile } from '../../core/utils/image-upload.util';
import { richTextToPlainText } from '../../core/utils/rich-text.util';
import { ProfileOverviewCardComponent } from './profile-overview-card.component';

interface ReceiptDueOption {
  id: number;
  code: number;
  value: string;
}

@Component({
  selector: 'app-profile-organization',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ProfileOverviewCardComponent],
  templateUrl: './profile-organization.component.html',
  styleUrls: ['./profile-organization.component.scss'],
})
export class ProfileOrganizationComponent implements OnInit {
  private readonly cropViewportSize = 320;
  private readonly cropMaxZoom = 3;
  private readonly title = inject(Title);
  private readonly auth = inject(AuthService);
  private readonly organizationService = inject(OrganizationService);
  private readonly orgState = inject(OrgStateService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly planOptions = [
    { value: 'starter', label: 'Starter' },
    { value: 'growth', label: 'Growth' },
    { value: 'enterprise', label: 'Enterprise' },
  ];

  readonly legalIdentifierTypes = [
    'CIN',
    'LLPIN',
    'Udyam (MSME)',
    'Import Export Code',
    'Firm Registration No.',
    'Trade License',
    'PT Registration No.',
  ];

  readonly taxTypes = ['GSTIN', 'PAN', 'TAN', 'LUT'];

  account: AccountProfile | null = this.auth.getCurrentAccount();
  organization: Organization | null = null;
  currencyOptions: CurrencyOption[] = [];
  receiptDueOptions: ReceiptDueOption[] = [];

  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;
  selectedCurrencyId: number | null = null;
  organizationImageUploading = false;
  organizationImageRemoving = false;
  organizationImageError: string | null = null;
  organizationImageSuccess: string | null = null;
  organizationImageModalOpen = false;
  organizationImageDraftUrl = '';
  selectedOrganizationImageFile: File | null = null;
  organizationCropZoom = 1;
  organizationCropMinZoom = 1;
  organizationCropOffsetX = 0;
  organizationCropOffsetY = 0;
  organizationCropImageWidth = 0;
  organizationCropImageHeight = 0;
  organizationCropSaving = false;
  organizationCropPreparing = false;
  organizationStraighten = 0;
  isOrganizationCropDragging = false;
  private organizationCropDragStartX = 0;
  private organizationCropDragStartY = 0;
  private organizationCropStartOffsetX = 0;
  private organizationCropStartOffsetY = 0;

  readonly form = this.fb.group({
    org_name: ['', [Validators.required, Validators.minLength(2)]],
    org_slug: [''],
    plan_code: ['growth'],
    uid: [{ value: '', disabled: true }],
    primary_address: this.createAddressGroup(),
    additional_addresses: this.fb.array([]),
    legal_identifiers: this.fb.array([]),
    tax_detail: this.fb.array([]),
    brand_settings: this.fb.group({
      logo_url: [''],
      primary_color: ['#1E40AF'],
      secondary_color: ['#0F172A'],
    }),
    invoice_settings: this.fb.group({
      invoice_prefix: [''],
      receipt_prefix: [''],
      invoice_number_start: [null as number | null],
      receipt_number_start: [null as number | null],
      receipt_due_id: [null as number | null],
      default_terms: [''],
      default_footer: [''],
    }),
    currency_settings: this.fb.group({
      default_currency: [''],
      currencies: this.fb.array([]),
    }),
  });

  ngOnInit(): void {
    this.title.setTitle('Clienet');
    this.loadData();
  }

  get additionalAddresses(): FormArray {
    return this.form.get('additional_addresses') as FormArray;
  }

  get legalIdentifiers(): FormArray {
    return this.form.get('legal_identifiers') as FormArray;
  }

  get taxDetails(): FormArray {
    return this.form.get('tax_detail') as FormArray;
  }

  get selectedCurrencies(): FormArray {
    return this.form.get(['currency_settings', 'currencies']) as FormArray;
  }

  get brandSettingsGroup(): FormGroup {
    return this.form.get('brand_settings') as FormGroup;
  }

  get invoiceSettingsGroup(): FormGroup {
    return this.form.get('invoice_settings') as FormGroup;
  }

  get currencySettingsGroup(): FormGroup {
    return this.form.get('currency_settings') as FormGroup;
  }

  get primaryAddressGroup(): FormGroup {
    return this.form.get('primary_address') as FormGroup;
  }

  get logoUrl(): string {
    return String(this.brandSettingsGroup.get('logo_url')?.value || '').trim();
  }

  get primaryColor(): string {
    return this.normalizeHexColor(this.brandSettingsGroup.get('primary_color')?.value, '#1E40AF');
  }

  get secondaryColor(): string {
    return this.normalizeHexColor(this.brandSettingsGroup.get('secondary_color')?.value, '#0F172A');
  }

  get createdByName(): string {
    const firstName = String(this.organization?.created_by?.first_name || '').trim();
    const lastName = String(this.organization?.created_by?.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || this.organization?.created_by?.email || 'Unavailable';
  }

  get roleLabel(): string {
    switch (String(this.account?.tenant_role || '')) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      case 'manager':
        return 'Manager';
      case 'viewer':
        return 'Viewer';
      default:
        return 'Member';
    }
  }

  get statusLabel(): string {
    if (!this.organization) {
      return 'No workspace';
    }
    if (!this.organization.is_active) {
      return 'Inactive';
    }
    if (!this.organization.is_provisioned) {
      return 'Setup Pending';
    }
    return 'Active';
  }

  get statusBadgeClass(): string {
    if (!this.organization) {
      return 'badge bg-secondary-subtle text-secondary';
    }
    if (!this.organization.is_active) {
      return 'badge bg-danger-subtle text-danger';
    }
    if (!this.organization.is_provisioned) {
      return 'badge bg-warning-subtle text-warning';
    }
    return 'badge bg-success-subtle text-success';
  }

  get availableCurrencies(): CurrencyOption[] {
    const selectedIds = new Set<number>(
      this.selectedCurrencies.controls
        .map((control) => Number(control.get('id')?.value))
        .filter((value) => value > 0)
    );

    return this.currencyOptions.filter((option) => !selectedIds.has(Number(option.id || 0)));
  }

  get defaultCurrencySymbol(): string {
    const selected = String(this.currencySettingsGroup.get('default_currency')?.value || '').trim();
    if (!selected) {
      return '-';
    }

    const match = this.selectedCurrencies.controls.find(
      (control) => String(control.get('shortname')?.value || '').trim() === selected
    );

    return String(match?.get('symbol')?.value || '-');
  }

  get organizationProfileImageUrl(): string {
    return imageUrl(this.organization?.profile_image);
  }

  get organizationImageFileName(): string {
    return String(this.organization?.profile_image?.original_name || '').trim();
  }

  get organizationImageMeta(): string {
    return formatImageAssetMeta(this.organization?.profile_image);
  }

  get activeOrganizationImageFileName(): string {
    return this.selectedOrganizationImageFile?.name || this.organizationImageFileName || 'No photo uploaded yet';
  }

  get activeOrganizationImageMeta(): string {
    if (this.selectedOrganizationImageFile) {
      const extension = String(this.selectedOrganizationImageFile.name || '').split('.').pop()?.toUpperCase() || '';
      return [formatFileSize(this.selectedOrganizationImageFile.size), extension].filter(Boolean).join(' • ');
    }

    return this.organizationImageMeta || 'Upload PNG, JPG, WEBP, or SVG up to 5MB.';
  }

  get organizationImageActionBusy(): boolean {
    return this.organizationImageUploading || this.organizationImageRemoving || this.organizationCropSaving || this.organizationCropPreparing;
  }

  get activeOrganizationImageUrl(): string {
    return this.organizationImageDraftUrl || this.organizationProfileImageUrl;
  }

  get isOrganizationCropDraftActive(): boolean {
    return !!this.organizationImageDraftUrl;
  }

  get organizationCropButtonLabel(): string {
    if (this.organizationCropPreparing) {
      return 'Opening...';
    }

    return 'Edit';
  }

  get organizationUpdateButtonLabel(): string {
    if (this.organizationImageUploading || this.organizationCropSaving) {
      return 'Updating...';
    }

    return this.organizationProfileImageUrl ? 'Update' : 'Upload';
  }

  get organizationCropImageStyle(): Record<string, string> {
    return {
      width: `${this.organizationCropImageWidth}px`,
      height: `${this.organizationCropImageHeight}px`,
      left: `calc(50% + ${this.organizationCropOffsetX}px)`,
      top: `calc(50% + ${this.organizationCropOffsetY}px)`,
      transform: `translate(-50%, -50%) scale(${this.organizationCropZoom}) rotate(${this.organizationStraighten}deg)`,
    };
  }

  get organizationModalTitle(): string {
    return this.isOrganizationCropDraftActive ? 'Edit image' : 'Organization profile photo';
  }

  loadData(): void {
    this.loading = true;
    this.error = null;
    this.success = null;

    this.organizationService.getCurrencyCatalog().subscribe({
      next: (options) => {
        this.currencyOptions = Array.isArray(options) ? options : [];
      },
      error: () => {
        this.currencyOptions = [];
      },
    });

    this.organizationService.getReceiptDueOptions().subscribe({
      next: (options) => {
        this.receiptDueOptions = Array.isArray(options) ? options : [];
      },
      error: () => {
        this.receiptDueOptions = [];
      },
    });

    this.auth
      .loadProfile()
      .pipe(
        tap((account) => {
          this.account = account;
        })
      )
      .subscribe({
        next: () => this.loadOrganization(),
        error: (error) => {
          this.loading = false;
          this.error = extractApiError(error, 'Failed to load your organization details.');
        },
      });
  }

  save(): void {
    this.error = null;
    this.success = null;
    this.form.markAllAsTouched();

    if (this.form.invalid || !this.organization) {
      return;
    }

    const raw = this.form.getRawValue();
    const selectedCurrencies = this.extractCurrencyOptions(raw.currency_settings?.currencies);
    const defaultCurrency =
      String(raw.currency_settings?.default_currency || '').trim() ||
      String(selectedCurrencies[0]?.shortname || '').trim();
    const defaultCurrencyOption =
      selectedCurrencies.find((item) => String(item.shortname || '').trim() === defaultCurrency) || null;

    const primaryAddress = this.normalizeAddress(raw.primary_address);
    const additionalAddresses = (raw.additional_addresses || [])
      .map((item: any) => this.normalizeAddress(item))
      .filter((item: Record<string, unknown>) => this.hasAddressData(item));
    const allAddresses = [
      ...(
        this.hasAddressData(primaryAddress)
          ? [primaryAddress]
          : []
      ),
      ...additionalAddresses,
    ];

    const receiptDue = this.receiptDueOptions.find(
      (option) => option.id === Number(raw.invoice_settings?.receipt_due_id)
    );

    const payload: Partial<Organization> = {
      org_name: String(raw.org_name || '').trim(),
      org_slug: String(raw.org_slug || '').trim(),
      plan_code: String(raw.plan_code || '').trim(),
      legal_identifiers: this.cleanTypeValueList(this.asRecordArray(raw.legal_identifiers)),
      tax_detail: this.cleanTypeValueList(this.asRecordArray(raw.tax_detail)),
      primary_address: primaryAddress,
      all_address: allAddresses,
      brand_settings: {
        ...(this.organization.brand_settings || {}),
        logo_url: this.logoUrl,
        primary_color: this.primaryColor,
        secondary_color: this.secondaryColor,
      },
      invoice_settings: {
        ...(this.organization.invoice_settings || {}),
        invoice_prefix: String(raw.invoice_settings?.invoice_prefix || '').trim(),
        receipt_prefix: String(raw.invoice_settings?.receipt_prefix || '').trim(),
        invoice_number_start: this.toNullableNumber(raw.invoice_settings?.invoice_number_start),
        receipt_number_start: this.toNullableNumber(raw.invoice_settings?.receipt_number_start),
        receipt_due_id: receiptDue?.id ?? null,
        receipt_due_days: receiptDue?.code ?? null,
        receipt_due_label: receiptDue?.value ?? '',
        default_terms: String(raw.invoice_settings?.default_terms || '').trim(),
        default_footer: String(raw.invoice_settings?.default_footer || '').trim(),
      },
      currency_settings: {
        ...(this.organization.currency_settings || {}),
        currencies: selectedCurrencies,
        default_currency: defaultCurrency,
        base_currency: defaultCurrency,
        currency_symbol: defaultCurrencyOption?.symbol || '',
      },
    };

    this.saving = true;

    this.organizationService.updateCurrent(payload).subscribe({
      next: (response) => {
        this.organization = this.extractOrganization(response);
        this.patchForm(this.organization);
        this.saving = false;
        this.success = response?.message || 'Organization updated successfully.';
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to update organization details.');
      },
    });
  }

  addLegalIdentifier(): void {
    this.legalIdentifiers.push(this.createTypeValueGroup());
  }

  removeLegalIdentifier(index: number): void {
    this.legalIdentifiers.removeAt(index);
  }

  addTaxDetail(): void {
    this.taxDetails.push(this.createTypeValueGroup());
  }

  removeTaxDetail(index: number): void {
    this.taxDetails.removeAt(index);
  }

  addAdditionalAddress(): void {
    this.additionalAddresses.push(this.createAddressGroup());
  }

  removeAdditionalAddress(index: number): void {
    this.additionalAddresses.removeAt(index);
  }

  addSelectedCurrency(): void {
    if (!this.selectedCurrencyId) {
      return;
    }

    const match = this.currencyOptions.find((option) => Number(option.id) === Number(this.selectedCurrencyId));
    if (!match) {
      return;
    }

    this.selectedCurrencies.push(this.createCurrencyGroup(match));
    if (!this.currencySettingsGroup.get('default_currency')?.value) {
      this.currencySettingsGroup.patchValue({ default_currency: match.shortname });
    }
    this.selectedCurrencyId = null;
  }

  removeCurrency(index: number): void {
    const removedShortname = String(this.selectedCurrencies.at(index).get('shortname')?.value || '');
    this.selectedCurrencies.removeAt(index);

    if (this.currencySettingsGroup.get('default_currency')?.value === removedShortname) {
      const nextShortname = String(this.selectedCurrencies.at(0)?.get('shortname')?.value || '');
      this.currencySettingsGroup.patchValue({ default_currency: nextShortname });
    }
  }

  refreshOrganization(): void {
    this.loadData();
  }

  openOrganizationImageModal(): void {
    this.organizationImageModalOpen = true;
    this.organizationImageError = null;
    this.organizationImageSuccess = null;
    this.cdr.markForCheck();
  }

  closeOrganizationImageModal(): void {
    this.organizationImageModalOpen = false;
    this.cancelOrganizationCropDraft();
    this.cdr.markForCheck();
  }

  handleOrganizationImageFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0);
    if (file) {
      this.prepareOrganizationImageDraft(file);
    }

    if (input) {
      input.value = '';
    }
  }

  prepareOrganizationImageDraft(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.organizationImageError = validationError;
      this.organizationImageSuccess = null;
      this.organizationImageModalOpen = true;
      this.cdr.markForCheck();
      return;
    }

    this.organizationImageError = null;
    this.organizationImageSuccess = null;
    this.organizationImageModalOpen = true;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '').trim();
      if (!result) {
        this.organizationImageError = 'Failed to read the selected image.';
        this.cdr.markForCheck();
        return;
      }

      const image = new Image();
      image.onload = () => {
        const baseScale = Math.max(this.cropViewportSize / image.width, this.cropViewportSize / image.height);
        this.selectedOrganizationImageFile = file;
        this.organizationImageDraftUrl = result;
        this.organizationCropImageWidth = image.width * baseScale;
        this.organizationCropImageHeight = image.height * baseScale;
        this.organizationCropMinZoom = 1;
        this.organizationCropZoom = 1;
        this.organizationCropOffsetX = 0;
        this.organizationCropOffsetY = 0;
        this.organizationStraighten = 0;
        this.organizationCropPreparing = false;
        this.cdr.markForCheck();
      };
      image.onerror = () => {
        this.organizationCropPreparing = false;
        this.organizationImageError = 'Failed to load the selected image.';
        this.cdr.markForCheck();
      };
      image.src = result;
    };
    reader.onerror = () => {
      this.organizationCropPreparing = false;
      this.organizationImageError = 'Failed to read the selected image.';
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  handleOrganizationCropAction(): void {
    if (this.isOrganizationCropDraftActive) {
      this.organizationImageError = null;
      this.organizationImageSuccess = null;
      this.cdr.markForCheck();
      return;
    }

    this.prepareExistingOrganizationImageDraft();
  }

  handleOrganizationUpdateAction(fileInput: HTMLInputElement): void {
    if (this.isOrganizationCropDraftActive) {
      this.saveCroppedOrganizationImage();
      return;
    }

    fileInput.click();
  }

  saveCroppedOrganizationImage(): void {
    if (!this.selectedOrganizationImageFile || !this.organizationImageDraftUrl) {
      return;
    }

    this.organizationCropSaving = true;
    this.organizationImageError = null;
    this.organizationImageSuccess = null;

    this.buildCroppedOrganizationImageFile()
      .then((croppedFile) => {
        this.organizationImageUploading = true;
        this.organizationCropSaving = false;
        this.organizationService.uploadOrganizationImage('profile_image', croppedFile).subscribe({
          next: (response) => {
            this.applyOrganizationImageResponse(response);
            this.organizationImageUploading = false;
            this.organizationImageSuccess = response?.message || 'Organization profile image updated successfully.';
            this.cancelOrganizationCropDraft();
            this.organizationImageModalOpen = true;
            this.cdr.markForCheck();
          },
          error: (error) => {
            this.organizationImageUploading = false;
            this.organizationImageError = extractApiError(error, 'Failed to update the organization profile image.');
            this.organizationImageModalOpen = true;
            this.cdr.markForCheck();
          },
        });
      })
      .catch(() => {
        this.organizationCropSaving = false;
        this.organizationImageError = 'Failed to crop the selected image.';
        this.cdr.markForCheck();
      });
  }

  onOrganizationCropZoomChange(value: string): void {
    const numericValue = Number(value);
    this.organizationCropZoom = Number.isFinite(numericValue)
      ? Math.max(this.organizationCropMinZoom, Math.min(this.cropMaxZoom, numericValue))
      : 1;
    this.clampOrganizationCropOffsets();
    this.cdr.markForCheck();
  }

  onOrganizationCropWheel(event: WheelEvent): void {
    if (!this.organizationImageDraftUrl) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    this.organizationCropZoom = Math.max(
      this.organizationCropMinZoom,
      Math.min(this.cropMaxZoom, this.organizationCropZoom + delta),
    );
    this.clampOrganizationCropOffsets();
    this.cdr.markForCheck();
  }

  onOrganizationStraightenChange(value: string): void {
    const numericValue = Number(value);
    this.organizationStraighten = Number.isFinite(numericValue) ? this.clamp(numericValue, -15, 15) : 0;
    this.cdr.markForCheck();
  }

  startOrganizationCropDrag(event: MouseEvent | TouchEvent): void {
    if (!this.organizationImageDraftUrl) {
      return;
    }

    const point = this.extractPoint(event);
    this.isOrganizationCropDragging = true;
    this.organizationCropDragStartX = point.x;
    this.organizationCropDragStartY = point.y;
    this.organizationCropStartOffsetX = this.organizationCropOffsetX;
    this.organizationCropStartOffsetY = this.organizationCropOffsetY;
    this.cdr.markForCheck();
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    this.handleOrganizationCropDragMove(event);
  }

  @HostListener('window:touchmove', ['$event'])
  onWindowTouchMove(event: TouchEvent): void {
    this.handleOrganizationCropDragMove(event);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onWindowDragEnd(): void {
    if (!this.isOrganizationCropDragging) {
      return;
    }

    this.isOrganizationCropDragging = false;
    this.cdr.markForCheck();
  }

  cancelOrganizationCropDraft(): void {
    this.organizationImageDraftUrl = '';
    this.selectedOrganizationImageFile = null;
    this.organizationCropZoom = 1;
    this.organizationCropMinZoom = 1;
    this.organizationCropOffsetX = 0;
    this.organizationCropOffsetY = 0;
    this.organizationCropImageWidth = 0;
    this.organizationCropImageHeight = 0;
    this.organizationCropPreparing = false;
    this.organizationStraighten = 0;
    this.isOrganizationCropDragging = false;
  }

  removeOrganizationProfileImage(): void {
    if (!this.organizationProfileImageUrl && !this.organizationImageDraftUrl) {
      return;
    }

    if (this.organizationImageDraftUrl) {
      this.cancelOrganizationCropDraft();
      this.cdr.markForCheck();
      return;
    }

    this.organizationImageRemoving = true;
    this.organizationImageError = null;
    this.organizationImageSuccess = null;

    this.organizationService.deleteOrganizationImage('profile_image').subscribe({
      next: (response) => {
        this.applyOrganizationImageResponse(response);
        this.organizationImageRemoving = false;
        this.organizationImageSuccess = response?.message || 'Organization profile image removed successfully.';
        this.organizationImageModalOpen = true;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.organizationImageRemoving = false;
        this.organizationImageError = extractApiError(error, 'Failed to remove the organization profile image.');
        this.organizationImageModalOpen = true;
        this.cdr.markForCheck();
      },
    });
  }

  formatTimestamp(value: string | null | undefined): string {
    if (!value) {
      return 'Unavailable';
    }

    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return 'Unavailable';
    }

    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  }

  trackByIndex(index: number): number {
    return index;
  }

  private loadOrganization(): void {
    this.organizationService.getCurrent().subscribe({
      next: (response) => {
        this.organization = this.extractOrganization(response);
        if (this.organization) {
          this.orgState.setOrg(this.organization);
        }
        this.patchForm(this.organization);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load your organization details.');
        this.cdr.markForCheck();
      },
    });
  }

  private patchForm(organization: Organization | null): void {
    const primaryAddress = organization?.primary_address || this.extractPrimaryAddress(organization?.all_address || []);
    const allAddresses = organization?.all_address || [];
    const additionalAddresses = this.extractAdditionalAddresses(allAddresses, primaryAddress);
    const brandSettings = (organization?.brand_settings || {}) as Record<string, unknown>;
    const invoiceSettings = (organization?.invoice_settings || {}) as Record<string, unknown>;
    const currencySettings = (organization?.currency_settings || {}) as Record<string, unknown>;

    this.form.patchValue(
      {
        org_name: organization?.org_name ?? '',
        org_slug: organization?.org_slug ?? '',
        plan_code: organization?.plan_code ?? 'growth',
        uid: organization?.uid ?? '',
        primary_address: {
          Country: String(primaryAddress?.['Country'] ?? primaryAddress?.['country'] ?? 'India'),
          address_line1: String(primaryAddress?.['address_line1'] ?? ''),
          address_line2: String(primaryAddress?.['address_line2'] ?? ''),
          city: String(primaryAddress?.['city'] ?? primaryAddress?.['City'] ?? ''),
          state: String(primaryAddress?.['county'] ?? primaryAddress?.['state'] ?? ''),
          pin_code: String(primaryAddress?.['pin_code'] ?? ''),
        },
        brand_settings: {
          logo_url: String(brandSettings['logo_url'] ?? ''),
          primary_color: this.normalizeHexColor(brandSettings['primary_color'], '#1E40AF'),
          secondary_color: this.normalizeHexColor(brandSettings['secondary_color'], '#0F172A'),
        },
        invoice_settings: {
          invoice_prefix: String(invoiceSettings['invoice_prefix'] ?? ''),
          receipt_prefix: String(invoiceSettings['receipt_prefix'] ?? ''),
          invoice_number_start: this.toNullableNumber(invoiceSettings['invoice_number_start']),
          receipt_number_start: this.toNullableNumber(invoiceSettings['receipt_number_start']),
          receipt_due_id: this.toNullableNumber(invoiceSettings['receipt_due_id']),
          default_terms: richTextToPlainText(invoiceSettings['default_terms']),
          default_footer: richTextToPlainText(invoiceSettings['default_footer']),
        },
        currency_settings: {
          default_currency: String(
            currencySettings['default_currency'] ??
            currencySettings['base_currency'] ??
            ''
          ),
        },
      },
      { emitEvent: false }
    );

    this.resetArray(
      this.legalIdentifiers,
      organization?.legal_identifiers || [],
      (item) => this.createTypeValueGroup(item)
    );
    this.resetArray(
      this.taxDetails,
      organization?.tax_detail || [],
      (item) => this.createTypeValueGroup(item)
    );
    this.resetArray(
      this.additionalAddresses,
      additionalAddresses,
      (item) => this.createAddressGroup(item)
    );
    this.resetArray(
      this.selectedCurrencies,
      Array.isArray(currencySettings['currencies']) ? (currencySettings['currencies'] as any[]) : [],
      (item) => this.createCurrencyGroup(item)
    );

    this.form.markAsPristine();
  }

  private createTypeValueGroup(value?: any): FormGroup {
    return this.fb.group({
      type: [String(value?.type ?? '')],
      value: [String(value?.value ?? '')],
    });
  }

  private createAddressGroup(value?: any): FormGroup {
    return this.fb.group({
      Country: [String(value?.Country ?? value?.country ?? 'India')],
      address_line1: [String(value?.address_line1 ?? '')],
      address_line2: [String(value?.address_line2 ?? '')],
      city: [String(value?.city ?? value?.City ?? '')],
      state: [String(value?.county ?? value?.state ?? '')],
      pin_code: [String(value?.pin_code ?? '')],
    });
  }

  private createCurrencyGroup(value?: any): FormGroup {
    return this.fb.group({
      id: [Number(value?.id ?? 0)],
      name: [String(value?.name ?? '')],
      shortname: [String(value?.shortname ?? '')],
      symbol: [String(value?.symbol ?? '')],
    });
  }

  private cleanTypeValueList(list: Array<Record<string, unknown>>): Array<{ type: string; value: string }> {
    return list
      .map((item) => ({
        type: String(item?.['type'] ?? '').trim(),
        value: String(item?.['value'] ?? '').trim(),
      }))
      .filter((item) => item.type || item.value);
  }

  private normalizeAddress(value: any): Record<string, unknown> {
    return {
      Country: String(value?.Country ?? value?.country ?? 'India').trim(),
      address_line1: String(value?.address_line1 ?? '').trim(),
      address_line2: String(value?.address_line2 ?? '').trim(),
      city: String(value?.city ?? value?.City ?? '').trim(),
      county: String(value?.state ?? value?.county ?? '').trim(),
      pin_code: String(value?.pin_code ?? '').trim(),
    };
  }

  private hasAddressData(value: Record<string, unknown>): boolean {
    return Object.values(value).some((item) => String(item ?? '').trim());
  }

  private normalizeHexColor(value: unknown, fallback: string): string {
    const text = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(text)) {
      return text;
    }
    return fallback;
  }

  private extractOrganization(response: any): Organization | null {
    return response?.data ?? response?.organization ?? response ?? null;
  }

  private asRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is Record<string, unknown> => item !== null && typeof item === 'object'
    );
  }

  private extractCurrencyOptions(value: unknown): CurrencyOption[] {
    return this.asRecordArray(value)
      .map((item) => ({
        id: this.toNullableNumber(item['id']),
        name: String(item['name'] ?? '').trim(),
        shortname: String(item['shortname'] ?? '').trim(),
        symbol: String(item['symbol'] ?? '').trim(),
      }))
      .filter((item) => Boolean(item.id) && Boolean(item.shortname));
  }

  private resetArray(arr: FormArray, items: any[], factory: (item: any) => FormGroup): void {
    while (arr.length) {
      arr.removeAt(0);
    }
    (items || []).forEach((item) => arr.push(factory(item)));
  }

  private extractPrimaryAddress(addresses: any[]): Record<string, unknown> {
    return Array.isArray(addresses) && addresses.length ? this.normalizeAddress(addresses[0]) : {};
  }

  private extractAdditionalAddresses(addresses: any[], primaryAddress: any): any[] {
    if (!Array.isArray(addresses) || !addresses.length) {
      return [];
    }

    const normalizedPrimary = JSON.stringify(this.normalizeAddress(primaryAddress || {}));
    const normalizedFirst = JSON.stringify(this.normalizeAddress(addresses[0] || {}));

    if (normalizedPrimary && normalizedPrimary === normalizedFirst) {
      return addresses.slice(1);
    }

    return addresses;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private applyOrganizationImageResponse(response: any): void {
    const responseOrganization = this.extractOrganization(response);

    if (responseOrganization) {
      this.organization = {
        ...(this.organization || {}),
        ...responseOrganization,
      };
    } else if (this.organization) {
      this.organization = {
        ...this.organization,
        profile_image: response?.profile_image || null,
      };
    }

    if (this.organization) {
      this.orgState.setOrg(this.organization);
    }
  }

  private async buildCroppedOrganizationImageFile(): Promise<File> {
    const image = await this.loadImage(this.organizationImageDraftUrl);
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
    context.translate(
      outputSize / 2 + this.organizationCropOffsetX * exportScale,
      outputSize / 2 + this.organizationCropOffsetY * exportScale,
    );
    context.rotate((this.organizationStraighten * Math.PI) / 180);
    context.scale(
      (this.organizationCropImageWidth / image.width) * this.organizationCropZoom * exportScale,
      (this.organizationCropImageHeight / image.height) * this.organizationCropZoom * exportScale,
    );
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

    return new File([blob], this.buildCroppedFileName(this.selectedOrganizationImageFile?.name), { type: 'image/png' });
  }

  private buildCroppedFileName(originalName: string | null | undefined): string {
    const baseName = String(originalName || 'organization-image')
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    return `${baseName || 'organization-image'}-cropped.png`;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });
  }

  private prepareExistingOrganizationImageDraft(): void {
    if (!this.organizationProfileImageUrl) {
      return;
    }

    this.organizationCropPreparing = true;
    this.organizationImageError = null;
    this.organizationImageSuccess = null;
    this.organizationImageModalOpen = true;
    this.cdr.markForCheck();

    fetch(this.organizationProfileImageUrl, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch current image');
        }

        return response.blob();
      })
      .then((blob) => {
        const fileType = blob.type || this.organization?.profile_image?.content_type || 'image/png';
        const fileName = this.organizationImageFileName || 'organization-image.png';
        this.prepareOrganizationImageDraft(new File([blob], fileName, { type: fileType }));
      })
      .catch(() => {
        this.organizationCropPreparing = false;
        this.organizationImageError = 'Failed to load the current organization photo for editing.';
        this.cdr.markForCheck();
      });
  }

  private handleOrganizationCropDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.isOrganizationCropDragging || !this.organizationImageDraftUrl) {
      return;
    }

    if ('cancelable' in event && event.cancelable) {
      event.preventDefault();
    }

    const point = this.extractPoint(event);
    this.organizationCropOffsetX = this.organizationCropStartOffsetX + (point.x - this.organizationCropDragStartX);
    this.organizationCropOffsetY = this.organizationCropStartOffsetY + (point.y - this.organizationCropDragStartY);
    this.clampOrganizationCropOffsets();
    this.cdr.markForCheck();
  }

  private clampOrganizationCropOffsets(): void {
    const scaledWidth = this.organizationCropImageWidth * this.organizationCropZoom;
    const scaledHeight = this.organizationCropImageHeight * this.organizationCropZoom;
    const maxOffsetX = Math.max(0, (scaledWidth - this.cropViewportSize) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - this.cropViewportSize) / 2);

    this.organizationCropOffsetX = this.clamp(this.organizationCropOffsetX, -maxOffsetX, maxOffsetX);
    this.organizationCropOffsetY = this.clamp(this.organizationCropOffsetY, -maxOffsetY, maxOffsetY);
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
}
