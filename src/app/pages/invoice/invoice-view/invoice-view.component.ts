import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { Invoice, InvoiceItem } from '../../../core/models/invoice.model';
import { InvoiceService } from '../../../core/services/invoice.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { richTextToLines, richTextToPlainText } from '../../../core/utils/rich-text.util';

type SnapshotRecord = Record<string, unknown>;
type InfoLine = { label: string; value: string };
type ReferenceRow = { label: string; value: string; extraLabel?: string; extraValue?: string };

@Component({
  selector: 'app-invoice-view',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './invoice-view.component.html',
  styleUrls: ['./invoice-view.component.scss'],
})
export class InvoiceViewComponent implements OnInit, OnDestroy {
  loading = false;
  listLoading = false;
  error: string | null = null;
  listError: string | null = null;
  invoice: Invoice | null = null;
  invoiceId = 0;

  invoices: Invoice[] = [];
  filteredInvoices: Invoice[] = [];
  invoiceSearch = '';
  readonly previewInvoice = {
    title: 'TAX INVOICE',
    subtitle: ['(Supply meant for export under LUT', 'without payment of integrated tax)'],
    brand: {
      leading: 'tech',
      trailing: 'genyz',
      company: 'Abhinava Innovations (DBA Techgenyz)',
      addressLines: [
        '1st Floor, 1005, Horizon, Eastern Metropolitan',
        'Bypass, Kolkata, West Bengal - 700105, India',
      ],
      gstin: '19BSAPM7630M1ZB',
      pan: 'BSAPM7630M',
    },
    billTo: {
      label: 'Invoice For',
      name: 'ALMOST VERIFIED LTD',
      lines: [
        '63-66 Hatton Garden Fifth Floor,',
        'Suite 23, London, EC1N 8LE',
        'Company number: 13653064',
      ],
    },
    facts: [
      { label: 'Invoice No:', value: 'AITG2025-26/0057' },
      { label: 'Invoice Date:', value: '11 November 2025' },
      { label: 'Terms:', value: 'Due on Receipt' },
      { label: 'Due Date:', value: '11 November 2025' },
    ],
    items: [
      {
        title: 'Article Placement',
        description: 'https://techgenyz.com/app-development-brief/',
        codeLabel: 'HSN Code',
        codeValue: '998439',
        qty: '1',
        rate: '50.00',
        amount: '$50.00',
      },
    ],
    totals: {
      itemsCount: '1',
      subTotal: '$50.00',
      total: '$50.00',
      amountWords: ['United States Dollar', 'Fifty'],
    },
    bankDetails: [
      { label: 'Account Name', value: 'SANDEEP MONDAL' },
      { label: 'Bank Name', value: 'ICICI Bank' },
      { label: 'Account Number', value: '105601003059' },
      { label: 'SWIFT code', value: 'ICICINBBNRI' },
      { label: 'PayPal ID', value: 'pay@techgenyz.com' },
    ],
    references: [
      { label: 'LUT ARN', value: 'AD191125001515G', dateLabel: 'Date', dateValue: '06/11/2025' },
      { label: 'LUT Order No.', value: 'ZD1911250168196', dateLabel: 'Date', dateValue: '11/11/2025' },
    ],
    terms: [
      'Once the invoice is raised, please make the payment within the due date.',
      'No refunds are allowed after the payment is made.',
    ],
    footer: {
      email: 'contact@techgenyz.com',
      website: 'techgenyz.com',
      brandBy: 'Abhinava Innovations',
    },
  };

  private readonly destroy$ = new Subject<void>();

  constructor(private route: ActivatedRoute, private invoiceService: InvoiceService) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.invoiceId = Number(params.get('id'));
      this.loadInvoice();
    });

    this.loadInvoiceList();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInvoiceSearch(event: Event): void {
    this.invoiceSearch = String((event.target as HTMLInputElement | null)?.value || '');
    this.applyInvoiceFilter();
  }

  isSelectedInvoice(invoice: Invoice): boolean {
    return Number(invoice?.id) === this.invoiceId;
  }

  get invoiceHeading(): string {
    switch (Number(this.invoice?.invoice_type)) {
      case 1:
        return 'PROFORMA INVOICE';
      case 2:
        return 'CREDIT NOTE';
      default:
        return 'TAX INVOICE';
    }
  }

  get invoiceSubtitle(): string {
    switch (Number(this.invoice?.invoice_type)) {
      case 1:
        return 'Preliminary billing document shared before final commercial confirmation.';
      case 2:
        return 'Adjustment note issued against a previously raised invoice.';
      default:
        return 'Digitally generated billing document for your workspace records.';
    }
  }

  get invoiceTermsLines(): string[] {
    const invoiceTerms = this.readTermsLines(this.invoice?.invoice_terms);
    if (invoiceTerms.length > 0) {
      return invoiceTerms;
    }

    return this.readTermsLines(this.organizationInvoiceSettings['default_terms']);
  }

  get termsPreview(): string {
    return this.invoiceTermsLines[0] || 'Standard payment terms apply';
  }

  get noteSectionTitle(): string {
    return this.bankDetailLines.length > 0 ? 'Bank Details' : 'Invoice Notes';
  }

  get noteLines(): InfoLine[] {
    if (this.bankDetailLines.length > 0) {
      return this.bankDetailLines;
    }

    return this.fallbackNoteLines;
  }

  get organizationAddressLines(): string[] {
    return this.readAddressLines(this.organizationSnapshot['primary_address']);
  }

  get accountAddressLines(): string[] {
    return this.readAddressLines(this.accountSnapshot['primary_address']);
  }

  get accountIdentifierLine(): string {
    return (
      this.lookupCollectionValue(this.accountSnapshot['legal_identifiers'], ['company', 'cin', 'registration']) ||
      this.lookupCollectionValue(this.accountSnapshot['tax_detail'], ['gst', 'vat', 'tax'])
    );
  }

  get organizationGstin(): string {
    return (
      this.lookupCollectionValue(this.organizationSnapshot['legal_identifiers'], ['gst', 'gstin']) ||
      this.lookupCollectionValue(this.organizationSnapshot['tax_detail'], ['gst', 'gstin'])
    );
  }

  get organizationPan(): string {
    return (
      this.lookupCollectionValue(this.organizationSnapshot['legal_identifiers'], ['pan']) ||
      this.lookupCollectionValue(this.organizationSnapshot['tax_detail'], ['pan'])
    );
  }

  get brandLogoUrl(): string {
    return this.readString(this.organizationBrandSettings, ['logo_url']);
  }

  get organizationInitials(): string {
    const words = this.organizationName().split(/\s+/).filter(Boolean).slice(0, 3);
    return words.map((word) => word.charAt(0).toUpperCase()).join('') || 'ORG';
  }

  get itemsCount(): number {
    return Array.isArray(this.invoice?.invoice_items) ? this.invoice!.invoice_items.length : 0;
  }

  get invoiceCurrencyCode(): string {
    return this.invoiceCurrency(this.invoice);
  }

  get totalInWords(): string {
    return this.amountToWords(Number(this.invoice?.total ?? 0), this.invoiceCurrencyCode);
  }

  get creatorEmail(): string {
    return this.readString(this.asRecord(this.invoice?.created_by), ['email']);
  }

  get shareUrl(): string {
    return this.invoice?.public_share_enabled ? String(this.invoice?.share_public_url || '').trim() : '';
  }

  get referenceRows(): ReferenceRow[] {
    const rows: ReferenceRow[] = [];
    const created = this.formatDateTime(this.invoice?.created_at);
    const updated = this.formatDateTime(this.invoice?.updated_at);
    const shareExpires = this.formatDateTime(this.invoice?.public_share_expires_at);
    const paidAt = this.formatDateTime(this.invoice?.paid_at);

    if (created !== '-' || updated !== '-') {
      rows.push({
        label: 'Created',
        value: created,
        extraLabel: updated !== '-' ? 'Updated' : undefined,
        extraValue: updated !== '-' ? updated : undefined,
      });
    }

    if (paidAt !== '-') {
      rows.push({ label: 'Paid At', value: paidAt });
    }

    if (this.invoice?.public_share_enabled && shareExpires !== '-') {
      rows.push({ label: 'Share Expires', value: shareExpires });
    }

    return rows;
  }

  get canMarkSent(): boolean {
    return Number(this.invoice?.invoice_status) === 0;
  }

  get canMarkPaid(): boolean {
    const status = Number(this.invoice?.invoice_status);
    return status !== 3 && status !== 5;
  }

  get canMarkVoid(): boolean {
    return Number(this.invoice?.invoice_status) !== 5;
  }

  loadInvoice(): void {
    if (!this.invoiceId) {
      this.invoice = null;
      return;
    }

    this.loading = true;
    this.error = null;

    this.invoiceService.get(this.invoiceId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (invoice) => {
        this.loading = false;
        this.invoice = invoice;
      },
      error: (error) => {
        this.loading = false;
        this.invoice = null;
        this.error = extractApiError(error, 'Failed to load invoice.');
      },
    });
  }

  accountName(invoice: Invoice | null | undefined = this.invoice): string {
    const snapshot = this.asRecord(invoice?.account_snapshot);
    return this.readString(snapshot, ['account_name']) || '-';
  }

  contactName(invoice: Invoice | null | undefined = this.invoice): string {
    const snapshot = this.asRecord(invoice?.contact_snapshot);
    const firstName = this.readString(snapshot, ['first_name']);
    const lastName = this.readString(snapshot, ['last_name']);
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || this.readString(snapshot, ['primary_email']) || '-';
  }

  dealName(invoice: Invoice | null | undefined = this.invoice): string {
    return this.readString(this.asRecord(invoice?.deal_snapshot), ['deal_name']) || '-';
  }

  organizationName(invoice: Invoice | null | undefined = this.invoice): string {
    return this.readString(this.asRecord(invoice?.organization_snapshot), ['org_name']) || 'Clienet Workspace';
  }

  invoiceStatusLabel(status: number = Number(this.invoice?.invoice_status ?? -1)): string {
    switch (Number(status)) {
      case 0:
        return 'Draft';
      case 1:
        return 'Sent';
      case 2:
        return 'Partial';
      case 3:
        return 'Paid';
      case 4:
        return 'Overdue';
      case 5:
        return 'Void';
      default:
        return '-';
    }
  }

  invoiceStatusClass(status: number = Number(this.invoice?.invoice_status ?? -1)): string {
    switch (Number(status)) {
      case 3:
        return 'is-paid';
      case 4:
        return 'is-overdue';
      case 1:
      case 2:
        return 'is-sent';
      case 5:
        return 'is-void';
      default:
        return 'is-draft';
    }
  }

  invoiceTypeLabel(type: number = Number(this.invoice?.invoice_type ?? -1)): string {
    switch (Number(type)) {
      case 0:
        return 'Standard';
      case 1:
        return 'Proforma';
      case 2:
        return 'Credit Note';
      default:
        return '-';
    }
  }

  invoiceCurrency(invoice: Invoice | null | undefined = this.invoice): string {
    if (Array.isArray(invoice?.invoice_items)) {
      const itemWithCurrency = invoice?.invoice_items.find((item) => String(item?.currency_code || '').trim());
      if (itemWithCurrency?.currency_code) {
        return String(itemWithCurrency.currency_code).trim().toUpperCase();
      }
    }

    const accountSnapshot = this.asRecord(invoice?.account_snapshot);
    const currencies = this.asArray(accountSnapshot['currencies']);
    if (currencies.length > 0) {
      const firstCurrency = this.asRecord(currencies[0]);
      return this.readString(firstCurrency, ['shortname', 'code']).toUpperCase() || 'INR';
    }

    return 'INR';
  }

  totalTax(invoice: Invoice | null | undefined = this.invoice): number {
    return (
      Number(invoice?.total_cgst ?? 0) +
      Number(invoice?.total_sgst ?? 0) +
      Number(invoice?.total_igst ?? 0)
    );
  }

  hasDiscount(invoice: Invoice | null | undefined = this.invoice): boolean {
    return Number(invoice?.discount ?? 0) > 0;
  }

  hasAdjustment(invoice: Invoice | null | undefined = this.invoice): boolean {
    return Number(invoice?.adjustment ?? 0) > 0;
  }

  lineAmount(item: InvoiceItem): number {
    const explicitTotal = Number(item?.line_total ?? NaN);
    if (!Number.isNaN(explicitTotal)) {
      return explicitTotal;
    }

    return Number(item?.quantity ?? 0) * Number(item?.unit_price ?? 0) + Number(item?.tax_value ?? 0);
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';

    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value));
    } catch {
      return '-';
    }
  }

  markSent(): void {
    if (!this.invoiceId) return;

    this.invoiceService.markSent(this.invoiceId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refreshViewData(),
      error: (error) => {
        this.error = extractApiError(error, 'Failed to mark invoice as sent.');
      },
    });
  }

  markPaid(): void {
    if (!this.invoiceId) return;

    this.invoiceService.markPaid(this.invoiceId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refreshViewData(),
      error: (error) => {
        this.error = extractApiError(error, 'Failed to mark invoice as paid.');
      },
    });
  }

  markVoid(): void {
    if (!this.invoiceId) return;

    this.invoiceService.markVoid(this.invoiceId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refreshViewData(),
      error: (error) => {
        this.error = extractApiError(error, 'Failed to void invoice.');
      },
    });
  }

  togglePublicShare(): void {
    if (!this.invoiceId) return;

    const request = this.invoice?.public_share_enabled
      ? this.invoiceService.disablePublicShare(this.invoiceId)
      : this.invoiceService.enablePublicShare(this.invoiceId);

    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.refreshViewData(),
      error: (error) => {
        this.error = extractApiError(error, 'Failed to update public share.');
      },
    });
  }

  downloadPdf(): void {
    if (!this.invoiceId) return;

    this.invoiceService.downloadPdf(this.invoiceId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${this.invoice?.invoice_no || 'invoice'}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error) => {
        this.error = extractApiError(error, 'Failed to download PDF.');
      },
    });
  }

  private refreshViewData(): void {
    this.loadInvoice();
    this.loadInvoiceList();
  }

  private loadInvoiceList(page = 1, collected: Invoice[] = []): void {
    if (page === 1) {
      this.listLoading = true;
      this.listError = null;
    }

    const headers = {
      'X-Limit': '100',
      'X-Page': String(page),
    };

    this.invoiceService.list(headers).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        const pageItems = Array.isArray(response?.list) ? (response.list as Invoice[]) : [];
        const merged = [...collected, ...pageItems];
        const totalPages = Number(response?.total_pages ?? 1);

        if (page < totalPages) {
          this.loadInvoiceList(page + 1, merged);
          return;
        }

        this.listLoading = false;
        this.invoices = merged;
        this.applyInvoiceFilter();
      },
      error: (error) => {
        this.listLoading = false;
        this.listError = extractApiError(error, 'Failed to load invoice list.');
        this.invoices = collected;
        this.applyInvoiceFilter();
      },
    });
  }

  private applyInvoiceFilter(): void {
    const term = this.invoiceSearch.trim().toLowerCase();

    if (!term) {
      this.filteredInvoices = [...this.invoices];
      return;
    }

    this.filteredInvoices = this.invoices.filter((invoice) => {
      const haystack = [
        invoice.invoice_no,
        this.accountName(invoice),
        this.contactName(invoice),
        this.invoiceStatusLabel(Number(invoice.invoice_status)),
        this.invoiceTypeLabel(Number(invoice.invoice_type)),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }

  private get organizationSnapshot(): SnapshotRecord {
    return this.asRecord(this.invoice?.organization_snapshot);
  }

  private get organizationBrandSettings(): SnapshotRecord {
    return this.asRecord(this.organizationSnapshot['brand_settings']);
  }

  private get organizationInvoiceSettings(): SnapshotRecord {
    return this.asRecord(this.organizationSnapshot['invoice_settings']);
  }

  private get accountSnapshot(): SnapshotRecord {
    return this.asRecord(this.invoice?.account_snapshot);
  }

  private get bankDetailLines(): InfoLine[] {
    const settings = this.organizationInvoiceSettings;
    const lines: InfoLine[] = [
      { label: 'Account Name', value: this.readString(settings, ['account_name', 'bank_account_name']) },
      { label: 'Bank Name', value: this.readString(settings, ['bank_name']) },
      { label: 'Account Number', value: this.readString(settings, ['account_number', 'bank_account_number']) },
      { label: 'SWIFT Code', value: this.readString(settings, ['swift_code', 'swift']) },
      { label: 'UPI ID', value: this.readString(settings, ['upi_id']) },
      { label: 'PayPal ID', value: this.readString(settings, ['paypal_id', 'paypal_email']) },
    ];

    return lines.filter((line) => line.value);
  }

  private get fallbackNoteLines(): InfoLine[] {
    const lines: InfoLine[] = [];
    const headerNote = this.readTextBlock(this.invoice?.invoice_header);
    const description = this.readTextBlock(this.invoice?.invoice_desc);
    const footerNote =
      this.readTextBlock(this.invoice?.invoice_footer) ||
      this.readString(this.organizationInvoiceSettings, ['default_footer']);

    if (headerNote) {
      lines.push({ label: 'Header Note', value: headerNote });
    }

    if (description) {
      lines.push({ label: 'Description', value: description });
    }

    if (footerNote) {
      lines.push({ label: 'Footer Note', value: footerNote });
    }

    if (this.shareUrl) {
      lines.push({ label: 'Public Share', value: this.shareUrl });
    }

    if (lines.length === 0) {
      lines.push({ label: 'Status', value: `${this.invoiceTypeLabel()} | ${this.invoiceStatusLabel()}` });
    }

    return lines;
  }

  private asRecord(value: unknown): SnapshotRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SnapshotRecord) : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private readString(record: SnapshotRecord, keys: string[]): string {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  private readAddressLines(value: unknown): string[] {
    const address = this.asRecord(value);
    if (Object.keys(address).length === 0) {
      return [];
    }

    const line1 = this.readString(address, ['address_line1']);
    const line2 = this.readString(address, ['address_line2']);
    const city = this.readString(address, ['city', 'City']);
    const state = this.readString(address, ['state', 'county']);
    const pinCode = this.readString(address, ['pin_code']);
    const country = this.readString(address, ['country', 'Country']);
    const locality = [city, state, pinCode].filter(Boolean).join(', ');

    return [line1, line2, locality, country].filter(Boolean);
  }

  private lookupCollectionValue(value: unknown, keywords: string[]): string {
    for (const entry of this.asArray(value)) {
      const record = this.asRecord(entry);
      const type = this.readString(record, ['type', 'label', 'name']).toLowerCase();
      const resolvedValue = this.readString(record, ['value', 'number', 'id']);

      if (resolvedValue && keywords.some((keyword) => type.includes(keyword))) {
        return resolvedValue;
      }
    }

    return '';
  }

  private readTextBlock(value: unknown): string {
    if (value && typeof value === 'object') {
      const text = (value as Record<string, unknown>)['text'];
      return richTextToPlainText(text);
    }

    return richTextToPlainText(value);
  }

  private readTermsLines(value: unknown): string[] {
    if (typeof value === 'string') {
      return richTextToLines(value);
    }

    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry: unknown) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          if (typeof record['text'] === 'string') return richTextToPlainText(record['text']);
          if (typeof record['value'] === 'string') return richTextToPlainText(record['value']);
        }
        return '';
      })
      .filter(Boolean);
  }

  private amountToWords(value: number, currencyCode: string): string {
    const absolute = Math.abs(Number.isFinite(value) ? value : 0);
    const whole = Math.floor(absolute);
    const fraction = Math.round((absolute - whole) * 100);
    const currencyName = this.currencyName(currencyCode);

    let output = `${currencyName} ${this.integerToWords(whole)}`.trim();
    if (fraction > 0) {
      output = `${output} and ${this.integerToWords(fraction)} Paise`;
    }

    return `${output} Only`;
  }

  private currencyName(code: string): string {
    const normalized = String(code || '').trim().toUpperCase();
    const names: Record<string, string> = {
      INR: 'Indian Rupee',
      USD: 'United States Dollar',
      EUR: 'Euro',
      GBP: 'British Pound',
      AED: 'UAE Dirham',
      SGD: 'Singapore Dollar',
      AUD: 'Australian Dollar',
      CAD: 'Canadian Dollar',
    };

    return names[normalized] || normalized || 'Currency';
  }

  private integerToWords(value: number): string {
    const num = Math.floor(Math.abs(value));
    if (num === 0) {
      return 'Zero';
    }

    const units = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const toWords = (current: number): string => {
      if (current < 20) {
        return units[current];
      }

      if (current < 100) {
        return `${tens[Math.floor(current / 10)]}${current % 10 ? ` ${units[current % 10]}` : ''}`;
      }

      if (current < 1000) {
        return `${units[Math.floor(current / 100)]} Hundred${current % 100 ? ` ${toWords(current % 100)}` : ''}`;
      }

      const scales = [
        { value: 1000000000, label: 'Billion' },
        { value: 1000000, label: 'Million' },
        { value: 1000, label: 'Thousand' },
      ];

      for (const scale of scales) {
        if (current >= scale.value) {
          const major = Math.floor(current / scale.value);
          const remainder = current % scale.value;
          return `${toWords(major)} ${scale.label}${remainder ? ` ${toWords(remainder)}` : ''}`;
        }
      }

      return '';
    };

    return toWords(num);
  }
}
