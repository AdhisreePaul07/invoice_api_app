import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  AppSettingsMap,
  AppSettingsResponse,
  InvoiceNumberAppSetting,
  ReceiptNumberAppSetting,
  TextAppSetting,
} from '../../../core/models/app-settings.model';
import { TenantMediaAsset } from '../../../core/models/image.model';
import { Organization } from '../../../core/models/organization.model';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { OrgStateService } from '../../../core/services/org-state.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { formatImageAssetMeta, imageUrl, validateImageFile } from '../../../core/utils/image-upload.util';
import { normalizeRichTextHtml, richTextToPlainText } from '../../../core/utils/rich-text.util';
import { ImageUploadFieldComponent } from '../../../shared/components/image-upload-field/image-upload-field.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

type OrganizationBrandingField = 'company_logo' | 'company_stamp';

interface OrganizationBrandingState {
  uploading: boolean;
  removing: boolean;
  error: string | null;
  success: string | null;
}

@Component({
  selector: 'app-invoice-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ImageUploadFieldComponent, RichTextEditorComponent],
  templateUrl: './invoice-settings.component.html',
  styleUrls: ['./invoice-settings.component.scss'],
})
export class InvoiceSettingsComponent implements OnInit {
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;
  organization: Organization | null = null;
  invoiceBackgroundAsset: TenantMediaAsset | null = null;
  invoiceBackgroundUploading = false;
  invoiceBackgroundRemoving = false;
  invoiceBackgroundError: string | null = null;
  invoiceBackgroundSuccess: string | null = null;
  readonly organizationBrandingState: Record<OrganizationBrandingField, OrganizationBrandingState> = {
    company_logo: this.createOrganizationBrandingState(),
    company_stamp: this.createOrganizationBrandingState(),
  };

  private currentSettings: AppSettingsMap = this.createDefaultSettings();
  private readonly invoiceBackgroundAssetKey = 'default';

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly appSettingsService: AppSettingsService,
    private readonly orgState: OrgStateService,
    private readonly organizationService: OrganizationService,
  ) {
    this.form = this.fb.group({
      invoice_prefix: ['INV'],
      invoice_suffix: ['0001'],
      next_number: ['INV-0001'],
      receipt_prefix: ['RCPT'],
      default_header_notes: [''],
      default_footer_notes: [''],
      default_description: [''],
      default_terms: [''],
    });
  }

  ngOnInit(): void {
    this.organization = this.orgState.current;
    this.loadOrganizationBranding();
    this.loadSettings();
  }

  resetFormData(): void {
    this.error = null;
    this.success = null;
    this.patchForm(this.currentSettings);
  }

  save(): void {
    this.error = null;
    this.success = null;
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const raw = this.form.getRawValue();
    const invoicePrefix = this.normalizePrefix(raw.invoice_prefix, 'INV');
    const invoiceSuffix = this.formatSequenceValue(raw.invoice_suffix, this.readNumberWidth(raw.invoice_suffix, raw.next_number));
    const nextNumber = this.normalizeDocumentNumber(raw.next_number) || this.buildDocumentNumber(invoicePrefix, invoiceSuffix);
    const payload: Partial<AppSettingsMap> = {
      invoice_number: {
        invoice_prefix: invoicePrefix,
        invoice_suffix: invoiceSuffix,
        next_number: nextNumber,
      },
      receipt_number: {
        receipt_prefix: this.normalizePrefix(raw.receipt_prefix, 'RCPT'),
      },
      invoice_header: {
        data: normalizeRichTextHtml(raw.default_header_notes),
      },
      invoice_footer: {
        data: normalizeRichTextHtml(raw.default_footer_notes),
      },
      invoice_description: {
        data: normalizeRichTextHtml(raw.default_description),
      },
      invoice_terms: {
        data: normalizeRichTextHtml(raw.default_terms),
      },
    };

    this.saving = true;

    this.appSettingsService.updateSettings(payload).subscribe({
      next: (response) => {
        this.saving = false;
        this.currentSettings = this.normalizeSettings(response?.settings);
        this.patchForm(this.currentSettings);
        this.syncOrganizationState(this.currentSettings);
        this.syncInvoiceBackgroundAsset(response);
        this.success = response?.message || 'App settings updated successfully.';
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to save invoice settings.');
      },
    });
  }

  private loadSettings(): void {
    this.loading = true;
    this.error = null;
    this.success = null;

    this.appSettingsService.getSettings().subscribe({
      next: (response) => {
        this.loading = false;
        this.currentSettings = this.normalizeSettings(response?.settings);
        this.patchForm(this.currentSettings);
        this.syncOrganizationState(this.currentSettings);
        this.syncInvoiceBackgroundAsset(response);
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load invoice settings.');
      },
    });
  }

  private patchForm(settings: AppSettingsMap): void {
    const invoiceSeries = this.readInvoiceSeries(settings.invoice_number);
    const receiptSeries = this.readReceiptSeries(settings.receipt_number);
    this.form.reset(
      {
        invoice_prefix: invoiceSeries.invoice_prefix,
        invoice_suffix: invoiceSeries.invoice_suffix,
        next_number: invoiceSeries.next_number || this.buildDocumentNumber(invoiceSeries.invoice_prefix, invoiceSeries.invoice_suffix),
        receipt_prefix: receiptSeries.receipt_prefix,
        default_header_notes: this.readRichTextSetting(settings.invoice_header),
        default_footer_notes: this.readRichTextSetting(settings.invoice_footer),
        default_description: this.readRichTextSetting(settings.invoice_description),
        default_terms: this.readRichTextSetting(settings.invoice_terms),
      },
      { emitEvent: false },
    );
  }

  private normalizeSettings(settings: AppSettingsMap | null | undefined): AppSettingsMap {
    const source = settings || {};
    const invoiceSeries = this.readInvoiceSeries(source.invoice_number);
    const receiptSeries = this.readReceiptSeries(source.receipt_number);
    return {
      ...source,
      invoice_number: invoiceSeries,
      receipt_number: receiptSeries,
      invoice_header: this.normalizeTextSetting(source.invoice_header),
      invoice_footer: this.normalizeTextSetting(source.invoice_footer),
      invoice_description: this.normalizeTextSetting(source.invoice_description),
      invoice_terms: this.normalizeTextSetting(source.invoice_terms),
    };
  }

  private syncOrganizationState(settings: AppSettingsMap): void {
    const currentOrg = this.orgState.current;
    if (!currentOrg) {
      return;
    }

    const invoiceSeries = this.readInvoiceSeries(settings.invoice_number);
    const receiptSeries = this.readReceiptSeries(settings.receipt_number);
    const headerText = this.readPlainTextSetting(settings.invoice_header);
    const footerText = this.readPlainTextSetting(settings.invoice_footer);
    const descriptionText = this.readPlainTextSetting(settings.invoice_description);
    const termsText = this.readPlainTextSetting(settings.invoice_terms);

    const nextOrg: Organization = {
      ...currentOrg,
      invoice_settings: {
        ...(currentOrg.invoice_settings || {}),
        invoice_prefix: invoiceSeries.invoice_prefix,
        invoice_suffix: invoiceSeries.invoice_suffix,
        next_number: invoiceSeries.next_number,
        receipt_prefix: receiptSeries.receipt_prefix,
        receipt_suffix: receiptSeries.receipt_suffix,
        receipt_next_number: receiptSeries.next_number,
        invoice_header: settings.invoice_header || {},
        invoice_footer: settings.invoice_footer || {},
        invoice_description: settings.invoice_description || {},
        invoice_terms: settings.invoice_terms || {},
        default_header_notes: headerText,
        default_header: headerText,
        default_footer_notes: footerText,
        default_footer: footerText,
        default_description: descriptionText,
        default_terms: termsText,
      },
    };

    this.organization = nextOrg;
    this.orgState.setOrg(nextOrg);
  }

  private normalizePrefix(value: unknown, fallback: string): string {
    const normalized = String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();

    return normalized || fallback;
  }

  private toPositiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private readRichTextSetting(value: unknown): string {
    if (typeof value === 'string') {
      return normalizeRichTextHtml(value);
    }
    if (Array.isArray(value)) {
      return normalizeRichTextHtml(
        value
          .map((item) => this.cleanText(item))
          .filter(Boolean)
          .join('\n'),
      );
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return normalizeRichTextHtml(record['data'] ?? record['text']);
    }
    return '';
  }

  private readPlainTextSetting(value: unknown): string {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.cleanText(item))
        .filter(Boolean)
        .join('\n');
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return richTextToPlainText(record['data'] ?? record['text']);
    }

    return richTextToPlainText(value);
  }

  private cleanText(value: unknown): string {
    return String(value || '').trim();
  }

  private normalizeTextSetting(value: unknown): TextAppSetting {
    const text = this.readRichTextSetting(value);
    return text ? { data: text } : {};
  }

  private readInvoiceSeries(value: unknown): InvoiceNumberAppSetting {
    const record = this.asRecord(value);
    const invoicePrefix = this.normalizePrefix(record['invoice_prefix'], 'INV');
    const invoiceSuffix = this.formatSequenceValue(
      record['invoice_suffix'],
      this.readNumberWidth(record['invoice_suffix'], record['next_number']),
    );
    return {
      ...record,
      invoice_prefix: invoicePrefix,
      invoice_suffix: invoiceSuffix,
      next_number: this.normalizeDocumentNumber(record['next_number']) || this.buildDocumentNumber(invoicePrefix, invoiceSuffix),
    };
  }

  private readReceiptSeries(value: unknown): ReceiptNumberAppSetting {
    const record = this.asRecord(value);
    return {
      ...record,
      receipt_prefix: this.normalizePrefix(record['receipt_prefix'], 'RCPT'),
      receipt_suffix: this.formatSequenceValue(record['receipt_suffix'], this.readNumberWidth(record['receipt_suffix'], record['next_number'])),
      next_number: this.normalizeDocumentNumber(record['next_number']),
    };
  }

  private readNumberWidth(...values: unknown[]): number {
    const widths = values
      .map((value) => String(value || ''))
      .map((value) => {
        const match = /(\d+)$/.exec(value);
        return match ? match[1].length : 0;
      })
      .filter((width) => width > 0);

    return Math.max(4, ...widths, 4);
  }

  private formatSequenceValue(value: unknown, width: number): string {
    const number = this.toPositiveInteger(value, 1);
    return String(number).padStart(Math.max(width, 4), '0');
  }

  private buildDocumentNumber(prefix: unknown, suffix: unknown): string {
    const normalizedPrefix = this.normalizePrefix(prefix, 'INV');
    const normalizedSuffix = this.formatSequenceValue(suffix, this.readNumberWidth(suffix));
    return `${normalizedPrefix}-${normalizedSuffix}`;
  }

  private normalizeDocumentNumber(value: unknown): string {
    return String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .toUpperCase()
      .replace(/^-+|-+$/g, '');
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private createDefaultSettings(): AppSettingsMap {
    return {
      invoice_number: {
        invoice_prefix: 'INV',
        invoice_suffix: '0001',
        next_number: 'INV-0001',
      },
      receipt_number: {
        receipt_prefix: 'RCPT',
        receipt_suffix: '0001',
        next_number: 'RCPT-0001',
      },
      invoice_header: {},
      invoice_footer: {},
      invoice_description: {},
      invoice_terms: {},
    };
  }

  get invoiceBackgroundUrl(): string {
    return imageUrl(this.invoiceBackgroundAsset?.file);
  }

  get invoiceBackgroundFileName(): string {
    return String(this.invoiceBackgroundAsset?.file?.original_name || '').trim();
  }

  get invoiceBackgroundMeta(): string {
    return formatImageAssetMeta(this.invoiceBackgroundAsset?.file);
  }

  get companyLogoUrl(): string {
    return imageUrl(this.organization?.company_logo);
  }

  get companyLogoFileName(): string {
    return this.organizationFileName('company_logo');
  }

  get companyLogoMeta(): string {
    return this.organizationFileMeta('company_logo');
  }

  get companyStampUrl(): string {
    return imageUrl(this.organization?.company_stamp);
  }

  get companyStampFileName(): string {
    return this.organizationFileName('company_stamp');
  }

  get companyStampMeta(): string {
    return this.organizationFileMeta('company_stamp');
  }

  onInvoiceBackgroundSelected(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.invoiceBackgroundError = validationError;
      this.invoiceBackgroundSuccess = null;
      return;
    }

    this.invoiceBackgroundUploading = true;
    this.invoiceBackgroundError = null;
    this.invoiceBackgroundSuccess = null;

    const request$ = this.invoiceBackgroundAsset?.id
      ? this.appSettingsService.replaceAsset(this.invoiceBackgroundAsset.id, {
          file,
          assetType: 'invoice_background',
          assetKey: this.invoiceBackgroundAssetKey,
          title: 'Default Invoice Background',
        })
      : this.appSettingsService.uploadAsset({
          file,
          assetType: 'invoice_background',
          assetKey: this.invoiceBackgroundAssetKey,
          title: 'Default Invoice Background',
        });

    request$.subscribe({
      next: (response) => {
        this.invoiceBackgroundUploading = false;
        this.invoiceBackgroundAsset = response?.data || null;
        this.invoiceBackgroundSuccess = response?.message || 'Invoice background updated successfully.';
      },
      error: (error) => {
        this.invoiceBackgroundUploading = false;
        this.invoiceBackgroundError = extractApiError(error, 'Failed to update the invoice background.');
      },
    });
  }

  removeInvoiceBackground(): void {
    if (!this.invoiceBackgroundAsset?.id) {
      return;
    }

    this.invoiceBackgroundRemoving = true;
    this.invoiceBackgroundError = null;
    this.invoiceBackgroundSuccess = null;

    this.appSettingsService.deleteAsset(this.invoiceBackgroundAsset.id).subscribe({
      next: (response) => {
        this.invoiceBackgroundRemoving = false;
        this.invoiceBackgroundAsset = null;
        this.invoiceBackgroundSuccess = response?.message || 'Invoice background removed successfully.';
      },
      error: (error) => {
        this.invoiceBackgroundRemoving = false;
        this.invoiceBackgroundError = extractApiError(error, 'Failed to remove the invoice background.');
      },
    });
  }

  onOrganizationBrandingSelected(field: OrganizationBrandingField, file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.setOrganizationBrandingState(field, { error: validationError, success: null });
      return;
    }

    this.setOrganizationBrandingState(field, {
      uploading: true,
      removing: false,
      error: null,
      success: null,
    });

    this.organizationService.uploadOrganizationImage(field, file).subscribe({
      next: (response) => {
        this.applyOrganizationBrandingResponse(field, response);
        this.setOrganizationBrandingState(field, {
          uploading: false,
          error: null,
          success: response?.message || 'Image updated successfully.',
        });
      },
      error: (error) => {
        this.setOrganizationBrandingState(field, {
          uploading: false,
          error: extractApiError(error, 'Failed to upload the image.'),
          success: null,
        });
      },
    });
  }

  removeOrganizationBranding(field: OrganizationBrandingField): void {
    const hasCurrentAsset = !!imageUrl(this.organization?.[field]);
    if (!hasCurrentAsset) {
      return;
    }

    this.setOrganizationBrandingState(field, {
      removing: true,
      uploading: false,
      error: null,
      success: null,
    });

    this.organizationService.deleteOrganizationImage(field).subscribe({
      next: (response) => {
        this.applyOrganizationBrandingResponse(field, response);
        this.setOrganizationBrandingState(field, {
          removing: false,
          error: null,
          success: response?.message || 'Image removed successfully.',
        });
      },
      error: (error) => {
        this.setOrganizationBrandingState(field, {
          removing: false,
          error: extractApiError(error, 'Failed to remove the image.'),
          success: null,
        });
      },
    });
  }

  private syncInvoiceBackgroundAsset(response: AppSettingsResponse | null | undefined): void {
    this.invoiceBackgroundAsset = this.appSettingsService.findFirstAsset(response, 'invoice_background', this.invoiceBackgroundAssetKey);
  }

  private loadOrganizationBranding(): void {
    this.organizationService.getCurrent().subscribe({
      next: (response) => {
        const organization = this.extractOrganization(response);
        if (!organization) {
          return;
        }

        this.organization = organization;
        this.orgState.setOrg(organization);
      },
      error: () => {
        this.organization = this.orgState.current;
      },
    });
  }

  private organizationFileName(field: OrganizationBrandingField): string {
    return String(this.organization?.[field]?.original_name || '').trim();
  }

  private organizationFileMeta(field: OrganizationBrandingField): string {
    return formatImageAssetMeta(this.organization?.[field]);
  }

  private applyOrganizationBrandingResponse(field: OrganizationBrandingField, response: any): void {
    const responseOrganization = this.extractOrganization(response);

    if (responseOrganization) {
      this.organization = {
        ...(this.organization || {}),
        ...responseOrganization,
      };
    } else if (this.organization) {
      this.organization = {
        ...this.organization,
        [field]: response?.[field] || null,
      };
    }

    if (this.organization) {
      this.orgState.setOrg(this.organization);
    }
  }

  private setOrganizationBrandingState(
    field: OrganizationBrandingField,
    patch: Partial<OrganizationBrandingState>,
  ): void {
    this.organizationBrandingState[field] = {
      ...this.organizationBrandingState[field],
      ...patch,
    };
  }

  private createOrganizationBrandingState(): OrganizationBrandingState {
    return {
      uploading: false,
      removing: false,
      error: null,
      success: null,
    };
  }

  private extractOrganization(response: any): Organization | null {
    return response?.data ?? response?.organization ?? response ?? null;
  }
}
