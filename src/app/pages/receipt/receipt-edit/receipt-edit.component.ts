import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';

import { ReceiptService } from '../../../core/services/receipt.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type ReceiptSectionKey = 'overview' | 'payment' | 'notes';
type SectionFeedback = { type: 'success' | 'error'; message: string };

type InvoiceLite = {
  id: number;
  invoice_no: string;
  total?: string | number;
  balance_due?: string | number;
  exchange_rate_data?: Record<string, unknown>;
  contact_snapshot?: Record<string, unknown>;
};

@Component({
  selector: 'app-receipt-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './receipt-edit.component.html',
  styleUrls: ['./receipt-edit.component.scss'],
})
export class ReceiptEditComponent implements OnInit {
  form: FormGroup;
  loading = false;
  error: string | null = null;
  receiptId = 0;
  receipt: any | null = null;

  invoices: InvoiceLite[] = [];
  selectedInvoice: InvoiceLite | null = null;
  invoiceSnapshot: Record<string, unknown> | null = null;

  sectionSaving: Record<ReceiptSectionKey, boolean> = {
    overview: false,
    payment: false,
    notes: false,
  };
  sectionFeedback: Partial<Record<ReceiptSectionKey, SectionFeedback>> = {};

  readonly paymentMethods = [
    { value: 0, label: 'Cash' },
    { value: 1, label: 'Bank Transfer' },
    { value: 2, label: 'UPI' },
    { value: 3, label: 'Card' },
    { value: 4, label: 'PayPal' },
    { value: 5, label: 'Wise' },
    { value: 6, label: 'Payoneer' },
    { value: 7, label: 'Others' },
  ];

  readonly receiptStatuses = [
    { value: 0, label: 'Completed' },
    { value: 1, label: 'Failed' },
    { value: 2, label: 'Cancelled' },
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private receiptService: ReceiptService,
    private invoiceService: InvoiceService
  ) {
    this.form = this.fb.group({
      receipt_no: ['', [Validators.required]],
      receipt_date: ['', [Validators.required]],
      payment_date: [''],
      invoice: [null, [Validators.required]],
      amount_received: [0, [Validators.required, Validators.min(0.01)]],
      payment_method: [1, [Validators.required]],
      transaction_ref: [''],
      receipt_status: [0, [Validators.required]],
      receipt_notes: [''],
    });
  }

  ngOnInit(): void {
    this.receiptId = Number(this.route.snapshot.paramMap.get('id'));

    this.form.get('invoice')?.valueChanges.subscribe(() => {
      this.onInvoiceChange();
    });

    this.loadInvoices();
    this.loadReceipt();
  }

  get pageTitle(): string {
    return String(this.form.get('receipt_no')?.value || '').trim() || 'Receipt';
  }

  get receiptStatusLabel(): string {
    const selectedValue = Number(this.form.get('receipt_status')?.value ?? 0);
    return this.receiptStatuses.find((status) => status.value === selectedValue)?.label || 'Completed';
  }

  get receiptDateLabel(): string {
    return String(this.form.get('receipt_date')?.value || '').trim() || 'Not set';
  }

  get invoiceLabel(): string {
    const invoiceId = this.toNumberOrNull(this.form.get('invoice')?.value);
    if (invoiceId) {
      return this.selectedInvoice?.invoice_no || this.invoices.find((invoice) => invoice.id === invoiceId)?.invoice_no || `Invoice #${invoiceId}`;
    }

    return this.snapshotInvoiceLabel;
  }

  get amountReceivedLabel(): string {
    const value = Number(this.form.get('amount_received')?.value ?? 0);
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get paymentMethodLabel(): string {
    const selectedValue = Number(this.form.get('payment_method')?.value ?? 1);
    return this.paymentMethods.find((method) => method.value === selectedValue)?.label || 'Bank Transfer';
  }

  get snapshotInvoiceLabel(): string {
    return String(this.selectedInvoice?.invoice_no || this.invoiceSnapshot?.['invoice_no'] || '').trim() || 'No invoice selected';
  }

  get snapshotTotalLabel(): string {
    const value = Number(this.selectedInvoice?.total ?? this.invoiceSnapshot?.['total'] ?? 0);
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get snapshotBalanceDueLabel(): string {
    const value = Number(this.selectedInvoice?.balance_due ?? this.invoiceSnapshot?.['balance_due'] ?? 0);
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get contactLabel(): string {
    const snapshot = (this.selectedInvoice?.contact_snapshot as Record<string, unknown> | undefined)
      || (this.invoiceSnapshot?.['contact_snapshot'] as Record<string, unknown> | undefined);

    if (!snapshot) {
      return 'No contact linked';
    }

    const name = `${String(snapshot['first_name'] || '').trim()} ${String(snapshot['last_name'] || '').trim()}`.trim();
    return name || String(snapshot['primary_email'] || '').trim() || 'No contact linked';
  }

  get isAnySectionSaving(): boolean {
    return Object.values(this.sectionSaving).some(Boolean);
  }

  resetFormData(): void {
    this.error = null;
    this.sectionFeedback = {};
    this.loadReceipt();
  }

  onInvoiceChange(): void {
    const invoiceId = this.toNumberOrNull(this.form.get('invoice')?.value);
    this.selectedInvoice = this.invoices.find((invoice) => invoice.id === invoiceId) || null;
  }

  saveOverviewSection(): void {
    const controls = ['receipt_no', 'invoice', 'receipt_date', 'payment_date'];
    const hasInvalidControl = controls.some((name) => this.form.get(name)?.invalid);
    if (hasInvalidControl) {
      controls.forEach((name) => this.form.get(name)?.markAsTouched());
      return;
    }

    this.updateSection('overview', this.buildOverviewPayload(), 'Receipt details updated successfully.');
  }

  savePaymentSection(): void {
    const controls = ['amount_received', 'payment_method', 'receipt_status'];
    const hasInvalidControl = controls.some((name) => this.form.get(name)?.invalid);
    if (hasInvalidControl) {
      controls.forEach((name) => this.form.get(name)?.markAsTouched());
      return;
    }

    this.updateSection('payment', this.buildPaymentPayload(), 'Payment details updated successfully.');
  }

  saveNotesSection(): void {
    this.updateSection('notes', this.buildNotesPayload(), 'Receipt notes updated successfully.');
  }

  feedbackFor(section: ReceiptSectionKey): SectionFeedback | null {
    return this.sectionFeedback[section] ?? null;
  }

  private loadInvoices(): void {
    this.invoiceService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        this.invoices = Array.isArray(res?.list) ? res.list : [];
        this.onInvoiceChange();
      },
      error: () => {
        this.invoices = [];
        this.onInvoiceChange();
      },
    });
  }

  private loadReceipt(showLoader = true): void {
    if (!this.receiptId) return;

    if (showLoader) {
      this.loading = true;
    }
    this.error = null;

    this.receiptService.get(this.receiptId).subscribe({
      next: (receipt: any) => {
        this.loading = false;
        this.receipt = receipt;
        this.invoiceSnapshot = receipt?.invoice_snapshot || null;

        this.form.patchValue(
          {
            receipt_no: receipt?.receipt_no ?? '',
            receipt_date: this.dateOnly(receipt?.receipt_date),
            payment_date: this.dateOnly(receipt?.payment_date),
            invoice: receipt?.invoice ?? null,
            amount_received: Number(receipt?.amount_received ?? 0),
            payment_method: Number(receipt?.payment_method ?? 1),
            transaction_ref: receipt?.transaction_ref ?? '',
            receipt_status: Number(receipt?.receipt_status ?? 0),
            receipt_notes: receipt?.receipt_notes ?? '',
          },
          { emitEvent: false }
        );

        this.onInvoiceChange();
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load receipt.');
      },
    });
  }

  private buildOverviewPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      receipt_no: String(raw.receipt_no || '').trim(),
      receipt_date: raw.receipt_date,
      payment_date: raw.payment_date || null,
      invoice: this.toNumberOrNull(raw.invoice),
      exchange_rate_data: this.selectedInvoice?.exchange_rate_data || this.receipt?.exchange_rate_data || {},
    };
  }

  private buildPaymentPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      amount_received: Number(raw.amount_received ?? 0),
      payment_method: Number(raw.payment_method ?? 1),
      receipt_status: Number(raw.receipt_status ?? 0),
      transaction_ref: String(raw.transaction_ref || '').trim(),
    };
  }

  private buildNotesPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      receipt_notes: String(raw.receipt_notes || '').trim(),
    };
  }

  private updateSection(section: ReceiptSectionKey, payload: Record<string, unknown>, successMessage: string): void {
    if (!this.receiptId) return;

    this.sectionSaving[section] = true;
    delete this.sectionFeedback[section];
    this.error = null;

    this.receiptService.update(this.receiptId, payload).subscribe({
      next: () => {
        this.sectionSaving[section] = false;
        this.sectionFeedback[section] = { type: 'success', message: successMessage };
        this.loadReceipt(false);
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

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const result = Number(value);
    return Number.isNaN(result) ? null : result;
  }

  private dateOnly(value: string | null | undefined): string {
    return value ? String(value).slice(0, 10) : '';
  }
}
