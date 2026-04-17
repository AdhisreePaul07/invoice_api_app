import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  AppSettingsMap,
  ReceiptNumberAppSetting,
  ReceiptNotesAppSetting,
} from '../../../core/models/app-settings.model';
import { Organization } from '../../../core/models/organization.model';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { OrgStateService } from '../../../core/services/org-state.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { normalizeRichTextHtml, richTextToPlainText } from '../../../core/utils/rich-text.util';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-receipt-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, RichTextEditorComponent],
  templateUrl: './receipt-settings.component.html',
  styleUrls: ['./receipt-settings.component.scss'],
})
export class ReceiptSettingsComponent implements OnInit {
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;

  private currentSettings: AppSettingsMap = this.createDefaultSettings();

  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly appSettingsService: AppSettingsService,
    private readonly orgState: OrgStateService,
  ) {
    this.form = this.fb.group({
      receipt_prefix: ['RCPT'],
      receipt_suffix: ['0001'],
      next_number: ['RCPT-0001'],
      notes: [''],
    });
  }

  ngOnInit(): void {
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
    const receiptPrefix = this.normalizePrefix(raw.receipt_prefix, 'RCPT');
    const receiptSuffix = this.formatSequenceValue(raw.receipt_suffix, this.readNumberWidth(raw.receipt_suffix, raw.next_number));
    const nextNumber = this.normalizeDocumentNumber(raw.next_number) || this.buildDocumentNumber(receiptPrefix, receiptSuffix);
    const payload: Partial<AppSettingsMap> = {
      receipt_number: {
        receipt_prefix: receiptPrefix,
        receipt_suffix: receiptSuffix,
        next_number: nextNumber,
      },
      receipt_notes: {
        data: normalizeRichTextHtml(raw.notes),
      },
    };

    this.saving = true;

    this.appSettingsService.updateSettings(payload).subscribe({
      next: (response) => {
        this.saving = false;
        this.currentSettings = this.normalizeSettings(response?.settings);
        this.patchForm(this.currentSettings);
        this.syncOrganizationState(this.currentSettings);
        this.success = response?.message || 'Receipt settings updated successfully.';
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to save receipt settings.');
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
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load receipt settings.');
      },
    });
  }

  private patchForm(settings: AppSettingsMap): void {
    const receiptSeries = this.readReceiptSeries(settings.receipt_number);
    this.form.reset(
      {
        receipt_prefix: receiptSeries.receipt_prefix,
        receipt_suffix: receiptSeries.receipt_suffix,
        next_number: receiptSeries.next_number || this.buildDocumentNumber(receiptSeries.receipt_prefix, receiptSeries.receipt_suffix),
        notes: this.readRichTextSetting(settings.receipt_notes),
      },
      { emitEvent: false },
    );
  }

  private normalizeSettings(settings: AppSettingsMap | null | undefined): AppSettingsMap {
    const source = settings || {};
    return {
      ...source,
      receipt_number: this.readReceiptSeries(source.receipt_number),
      receipt_notes: this.normalizeTextSetting(source.receipt_notes),
    };
  }

  private syncOrganizationState(settings: AppSettingsMap): void {
    const currentOrg = this.orgState.current;
    if (!currentOrg) {
      return;
    }

    const receiptSeries = this.readReceiptSeries(settings.receipt_number);
    const notesText = this.readPlainTextSetting(settings.receipt_notes);

    const nextOrg: Organization = {
      ...currentOrg,
      invoice_settings: {
        ...(currentOrg.invoice_settings || {}),
        receipt_prefix: receiptSeries.receipt_prefix,
        receipt_suffix: receiptSeries.receipt_suffix,
        receipt_next_number: receiptSeries.next_number,
        receipt_notes: settings.receipt_notes || {},
        default_receipt_notes: notesText,
      },
    };

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

  private normalizeTextSetting(value: unknown): ReceiptNotesAppSetting {
    const text = this.readRichTextSetting(value);
    return text ? { data: text } : {};
  }

  private readReceiptSeries(value: unknown): ReceiptNumberAppSetting {
    const record = this.asRecord(value);
    const receiptPrefix = this.normalizePrefix(record['receipt_prefix'], 'RCPT');
    const receiptSuffix = this.formatSequenceValue(
      record['receipt_suffix'],
      this.readNumberWidth(record['receipt_suffix'], record['next_number']),
    );
    return {
      ...record,
      receipt_prefix: receiptPrefix,
      receipt_suffix: receiptSuffix,
      next_number: this.normalizeDocumentNumber(record['next_number']) || this.buildDocumentNumber(receiptPrefix, receiptSuffix),
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
    const normalizedPrefix = this.normalizePrefix(prefix, 'RCPT');
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
      receipt_number: {
        receipt_prefix: 'RCPT',
        receipt_suffix: '0001',
        next_number: 'RCPT-0001',
      },
      receipt_notes: {},
    };
  }
}
