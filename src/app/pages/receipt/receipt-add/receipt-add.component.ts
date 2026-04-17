import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { ReceiptService } from '../../../core/services/receipt.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type ReceiptAccountOption = {
  id: number;
  label: string;
};

@Component({
  selector: 'app-receipt-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './receipt-add.component.html',
  styleUrls: ['./receipt-add.component.scss'],
})
export class ReceiptAddComponent implements OnInit {
  form: FormGroup;
  loading = false;
  saving = false;
  error: string | null = null;

  invoices: any[] = [];
  availableInvoices: any[] = [];
  accountOptions: ReceiptAccountOption[] = [];
  selectedInvoice: any = null;

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
    private receiptService: ReceiptService,
    private invoiceService: InvoiceService,
    private router: Router
  ) {
    this.form = this.fb.group({
      receipt_no: ['', [Validators.required]],
      account: [null],
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
    this.loading = true;
    this.invoiceService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.invoices = Array.isArray(res?.list) ? res.list : [];
        this.accountOptions = this.buildAccountOptions(this.invoices);
        this.availableInvoices = [...this.invoices];
      },
      error: () => {
        this.loading = false;
        this.invoices = [];
        this.availableInvoices = [];
        this.accountOptions = [];
      },
    });
  }

  resetFormData(): void {
    this.error = null;
    this.selectedInvoice = null;
    this.availableInvoices = [...this.invoices];

    this.form.reset(
      {
        receipt_no: '',
        account: null,
        receipt_date: '',
        payment_date: '',
        invoice: null,
        amount_received: 0,
        payment_method: 1,
        transaction_ref: '',
        receipt_status: 0,
        receipt_notes: '',
      },
      { emitEvent: false }
    );
  }

  onAccountChange(): void {
    const accountId = this.toAccountId(this.form.get('account')?.value);
    this.availableInvoices = accountId === null
      ? [...this.invoices]
      : this.invoices.filter((invoice) => this.invoiceAccountId(invoice) === accountId);

    const selectedInvoiceId = Number(this.form.get('invoice')?.value);
    const matchedInvoice = this.availableInvoices.find((invoice) => Number(invoice?.id) === selectedInvoiceId) || null;

    if (!matchedInvoice) {
      this.selectedInvoice = null;
      this.form.patchValue(
        {
          invoice: null,
          amount_received: 0,
        },
        { emitEvent: false }
      );
      return;
    }

    this.selectedInvoice = matchedInvoice;
  }

  onInvoiceChange(): void {
    const invoiceId = Number(this.form.get('invoice')?.value);
    this.selectedInvoice = this.invoices.find((invoice) => Number(invoice.id) === invoiceId) || null;

    if (this.selectedInvoice) {
      const accountId = this.invoiceAccountId(this.selectedInvoice);
      if (accountId !== null) {
        this.form.patchValue({ account: accountId }, { emitEvent: false });
        this.availableInvoices = this.invoices.filter((invoice) => this.invoiceAccountId(invoice) === accountId);
      }

      const suggestedAmount = Number(this.selectedInvoice.balance_due ?? this.selectedInvoice.total ?? 0);
      this.form.patchValue({ amount_received: suggestedAmount }, { emitEvent: false });
      return;
    }

    this.form.patchValue({ amount_received: 0 }, { emitEvent: false });
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
      receipt_no: String(raw.receipt_no || '').trim(),
      receipt_date: raw.receipt_date,
      payment_date: raw.payment_date || null,
      invoice: raw.invoice != null ? Number(raw.invoice) : null,
      exchange_rate_data: this.selectedInvoice?.exchange_rate_data || {},
      amount_received: Number(raw.amount_received ?? 0),
      payment_method: Number(raw.payment_method ?? 1),
      transaction_ref: String(raw.transaction_ref || '').trim(),
      receipt_status: Number(raw.receipt_status ?? 0),
      receipt_notes: String(raw.receipt_notes || '').trim(),
    };

    this.receiptService.add(payload).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/receipts']);
      },
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err, 'Failed to create receipt.');
      },
    });
  }

  private buildAccountOptions(invoices: any[]): ReceiptAccountOption[] {
    const byId = new Map<number, ReceiptAccountOption>();

    invoices.forEach((invoice) => {
      const accountId = this.invoiceAccountId(invoice);
      const accountLabel = String(invoice?.account_snapshot?.account_name || '').trim() || '-';

      if (accountId === null || accountLabel === '-') {
        return;
      }

      if (!byId.has(accountId)) {
        byId.set(accountId, {
          id: accountId,
          label: accountLabel,
        });
      }
    });

    return Array.from(byId.values()).sort((left, right) => left.label.localeCompare(right.label));
  }

  private invoiceAccountId(invoice: any): number | null {
    const rawId = invoice?.account_snapshot?.id;
    const accountId = Number(rawId);
    return Number.isNaN(accountId) ? null : accountId;
  }

  private toAccountId(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const accountId = Number(value);
    return Number.isNaN(accountId) ? null : accountId;
  }
}
