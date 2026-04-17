import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { InvoiceSettings } from '../../../core/models/organization.model';
import { AccountService } from '../../../core/services/account.service';
import { ContactService } from '../../../core/services/contact.service';
import { DealService } from '../../../core/services/deal.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ItemService } from '../../../core/services/item.service';
import { OrgStateService } from '../../../core/services/org-state.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { richTextToPlainText } from '../../../core/utils/rich-text.util';
import {
  InvoiceDesignerPreviewData,
  InvoiceDesignerStudioComponent,
} from '../invoice-designer-studio/invoice-designer-studio.component';

type InvoiceAccountOption = {
  id: number;
  account_name: string;
};

type InvoiceContactOption = {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  accountIds: number[];
};

type InvoiceDealOption = {
  id: number;
  deal_name: string;
  accountIds: number[];
  contactIds: number[];
};

type InvoiceOrganizationOption = {
  id: number;
  org_name: string;
};

@Component({
  selector: 'app-invoice-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, InvoiceDesignerStudioComponent],
  templateUrl: './invoice-add.component.html',
  styleUrls: ['./invoice-add.component.scss'],
})
export class InvoiceAddComponent implements OnInit {
  form: FormGroup;
  saving = false;
  error: string | null = null;

  accounts: InvoiceAccountOption[] = [];
  contacts: InvoiceContactOption[] = [];
  deals: InvoiceDealOption[] = [];
  items: any[] = [];
  organizations: InvoiceOrganizationOption[] = [];

  filteredContacts: InvoiceContactOption[] = [];
  filteredDeals: InvoiceDealOption[] = [];

  private defaultOrganizationId: number | null = null;
  private preselectedDealId: number | null = null;
  private invoiceSettings: InvoiceSettings = this.createDefaultInvoiceSettings();
  private invoiceNumberRequestId = 0;

  readonly trackByIndex = (index: number): number => index;

  readonly invoiceTypeOptions = [
    { value: 0, label: 'Standard' },
    { value: 1, label: 'Proforma' },
    { value: 2, label: 'Credit Note' },
  ];

  readonly invoiceStatusOptions = [
    { value: 0, label: 'Draft' },
    { value: 1, label: 'Sent' },
    { value: 2, label: 'Partial' },
    { value: 3, label: 'Paid' },
    { value: 4, label: 'Overdue' },
    { value: 5, label: 'Void' },
  ];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private accountService: AccountService,
    private contactService: ContactService,
    private dealService: DealService,
    private itemService: ItemService,
    private invoiceService: InvoiceService,
    private orgState: OrgStateService,
    private organizationService: OrganizationService,
  ) {
    this.form = this.fb.group({
      invoice_no: ['', [Validators.required]],
      invoice_date: ['', [Validators.required]],
      due_date: [''],
      invoice_status: [0, [Validators.required]],
      invoice_type: [0, [Validators.required]],
      account: [null],
      contact: [null],
      deal: [null],
      organization: [null],
      discount: [0],
      adjustment: [0],
      public_share_enabled: [false],
      invoice_header_text: [''],
      invoice_footer_text: [''],
      invoice_desc_text: [''],
      invoice_terms_text: [''],
      invoice_items: this.fb.array([this.makeItemGroup()]),
    });
  }

  ngOnInit(): void {
    this.preselectedDealId = this.toNumberOrNull(this.route.snapshot.queryParamMap.get('deal_id'));

    this.form.get('account')?.valueChanges.subscribe(() => {
      this.syncFilteredRelationships();
    });

    this.form.get('contact')?.valueChanges.subscribe(() => {
      this.syncFilteredRelationships();
    });

    this.form.get('invoice_date')?.valueChanges.subscribe(() => {
      void this.refreshAutoInvoiceNumber();
    });

    this.loadLookups();
    this.loadInvoiceSettings();
    void this.refreshAutoInvoiceNumber();

    if (this.preselectedDealId) {
      this.form.patchValue({ deal: this.preselectedDealId }, { emitEvent: false });
    }
  }

  get itemArr(): FormArray {
    return this.form.get('invoice_items') as FormArray;
  }

  private makeItemGroup(value?: any): FormGroup {
    return this.fb.group({
      item_catalog_id: [value?.item_catalog_id ?? null],
      item_name: [value?.item_name ?? '', [Validators.required]],
      item_code: [value?.item_code ?? ''],
      item_details: [value?.item_details ?? ''],
      quantity: [value?.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      unit_price: [value?.unit_price ?? 0, [Validators.required, Validators.min(0)]],
      currency_code: [value?.currency_code ?? 'INR', [Validators.required]],
      tax_value: [value?.tax_value ?? 0, [Validators.min(0)]],
    });
  }

  addItem(): void {
    this.itemArr.push(this.makeItemGroup());
  }

  removeItem(index: number): void {
    if (this.itemArr.length > 1) {
      this.itemArr.removeAt(index);
    }
  }

  onCatalogChange(index: number): void {
    const row = this.itemArr.at(index);
    const catalogId = this.toNumberOrNull(row.get('item_catalog_id')?.value);
    if (!catalogId) return;

    const catalog = this.items.find((item) => Number(item.id) === catalogId);
    if (!catalog) return;

    row.patchValue(
      {
        item_name: catalog.item_name ?? '',
        item_code: catalog.item_code ?? '',
        item_details: catalog.item_details ?? '',
        unit_price: Number(catalog.default_unit_price ?? 0),
        currency_code: catalog.currency_code ?? 'INR',
        tax_value: Number(catalog.default_tax_value ?? 0),
      },
      { emitEvent: false }
    );
  }

  resetFormData(): void {
    this.error = null;

    while (this.itemArr.length) {
      this.itemArr.removeAt(0);
    }
    this.itemArr.push(this.makeItemGroup());

    this.form.reset(
      {
        invoice_no: '',
        invoice_date: '',
        due_date: '',
        invoice_status: 0,
        invoice_type: 0,
        account: null,
        contact: null,
        deal: this.preselectedDealId,
        organization: this.defaultOrganizationId,
        discount: 0,
        adjustment: 0,
        public_share_enabled: false,
        invoice_header_text: '',
        invoice_footer_text: '',
        invoice_desc_text: '',
        invoice_terms_text: '',
      },
      { emitEvent: false }
    );

    this.syncFilteredRelationships();
    this.applyDefaultInvoiceContent(true);
    void this.refreshAutoInvoiceNumber();
  }

  private loadLookups(): void {
    this.accountService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        this.accounts = (Array.isArray(res?.list) ? res.list : []).map((account: any) => ({
          id: Number(account?.id),
          account_name: String(account?.account_name || ''),
        }));
        this.syncFilteredRelationships();
      },
      error: () => {
        this.accounts = [];
        this.syncFilteredRelationships();
      },
    });

    this.contactService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        this.contacts = (Array.isArray(res?.list) ? res.list : []).map((contact: any) => ({
          id: Number(contact?.id),
          first_name: String(contact?.first_name || ''),
          last_name: String(contact?.last_name || ''),
          primary_email: String(contact?.primary_email || ''),
          accountIds: Array.isArray(contact?.account_details)
            ? contact.account_details
                .map((account: any) => Number(account?.id))
                .filter((id: number) => !Number.isNaN(id))
            : [],
        }));
        this.syncFilteredRelationships();
      },
      error: () => {
        this.contacts = [];
        this.syncFilteredRelationships();
      },
    });

    this.dealService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        this.deals = (Array.isArray(res?.list) ? res.list : []).map((deal: any) => ({
          id: Number(deal?.id),
          deal_name: String(deal?.deal_name || ''),
          accountIds: Array.isArray(deal?.account_details)
            ? deal.account_details
                .map((account: any) => Number(account?.id))
                .filter((id: number) => !Number.isNaN(id))
            : [],
          contactIds: Array.isArray(deal?.contact_details)
            ? deal.contact_details
                .map((contact: any) => Number(contact?.id))
                .filter((id: number) => !Number.isNaN(id))
            : [],
        }));
        this.syncFilteredRelationships();
      },
      error: () => {
        this.deals = [];
        this.syncFilteredRelationships();
      },
    });

    this.itemService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        this.items = Array.isArray(res?.list) ? res.list : [];
      },
      error: () => {
        this.items = [];
      },
    });

    this.orgState.ensureLoaded().subscribe((org) => {
      this.organizations = org ? [{ id: Number(org.id), org_name: String(org.org_name || '') }] : [];
      this.defaultOrganizationId = org?.id ? Number(org.id) : null;
      if (this.defaultOrganizationId && !this.form.get('organization')?.value) {
        this.form.patchValue({ organization: this.defaultOrganizationId }, { emitEvent: false });
      }
    });
  }

  private loadInvoiceSettings(): void {
    this.organizationService.getInvoiceSettings().subscribe({
      next: (response) => {
        this.invoiceSettings = this.normalizeInvoiceSettings(response?.invoice_settings);
        this.applyDefaultInvoiceContent(false);
        void this.refreshAutoInvoiceNumber();
      },
      error: () => {
        this.invoiceSettings = this.createDefaultInvoiceSettings();
        this.applyDefaultInvoiceContent(false);
        void this.refreshAutoInvoiceNumber();
      },
    });
  }

  private syncFilteredRelationships(): void {
    const accountId = this.toNumberOrNull(this.form.get('account')?.value);
    const selectedContactId = this.toNumberOrNull(this.form.get('contact')?.value);
    const selectedDealId = this.toNumberOrNull(this.form.get('deal')?.value);

    this.filteredContacts = accountId
      ? this.contacts.filter((contact) => contact.accountIds.includes(accountId))
      : [...this.contacts];

    if (selectedContactId && this.contacts.length > 0 && !this.filteredContacts.some((contact) => contact.id === selectedContactId)) {
      this.form.get('contact')?.setValue(null, { emitEvent: false });
    }

    const effectiveContactId = this.toNumberOrNull(this.form.get('contact')?.value);

    this.filteredDeals = this.deals.filter((deal) => {
      const matchesAccount = !accountId || deal.accountIds.length === 0 || deal.accountIds.includes(accountId);
      const matchesContact = !effectiveContactId || deal.contactIds.length === 0 || deal.contactIds.includes(effectiveContactId);
      return matchesAccount && matchesContact;
    });

    if (selectedDealId && this.deals.length > 0 && !this.filteredDeals.some((deal) => deal.id === selectedDealId)) {
      this.form.get('deal')?.setValue(null, { emitEvent: false });
    }
  }

  lineSubtotal(index: number): number {
    const row = this.itemArr.at(index)?.getRawValue();
    return Number(row?.quantity ?? 0) * Number(row?.unit_price ?? 0);
  }

  lineTotal(index: number): number {
    const row = this.itemArr.at(index)?.getRawValue();
    return this.lineSubtotal(index) + Number(row?.tax_value ?? 0);
  }

  get subtotal(): number {
    return this.itemArr.controls.reduce((sum, _row, index) => sum + this.lineSubtotal(index), 0);
  }

  get totalTax(): number {
    return this.itemArr.controls.reduce((sum, row) => sum + Number(row.get('tax_value')?.value ?? 0), 0);
  }

  get grandTotal(): number {
    const discount = Number(this.form.get('discount')?.value ?? 0);
    const adjustment = Number(this.form.get('adjustment')?.value ?? 0);
    return this.subtotal + this.totalTax - discount + adjustment;
  }

  get designerPreviewData(): InvoiceDesignerPreviewData {
    const raw = this.form.getRawValue();
    const organizationId = this.toNumberOrNull(raw.organization);
    const accountId = this.toNumberOrNull(raw.account);
    const contactId = this.toNumberOrNull(raw.contact);

    const selectedOrganization = this.organizations.find((org) => org.id === organizationId);
    const selectedAccount = this.accounts.find((account) => account.id === accountId);
    const selectedContact = this.contacts.find((contact) => contact.id === contactId);
    const statusLabel = this.invoiceStatusOptions.find((status) => status.value === Number(raw.invoice_status ?? 0))?.label || 'Draft';
    const invoiceTypeLabel = this.invoiceTypeOptions.find((type) => type.value === Number(raw.invoice_type ?? 0))?.label || 'Standard';

    const headerText = this.resolveInvoiceContentValue(raw.invoice_header_text, this.readHeaderDefault(this.invoiceSettings));
    const footerText = this.resolveInvoiceContentValue(raw.invoice_footer_text, this.readFooterDefault(this.invoiceSettings));
    const descriptionText = this.resolveInvoiceContentValue(raw.invoice_desc_text, this.readDescriptionDefault(this.invoiceSettings));
    const termsText = this.resolveInvoiceContentValue(raw.invoice_terms_text, this.readTermsDefault(this.invoiceSettings));

    return {
      invoiceNo: String(raw.invoice_no || '').trim() || 'Draft Invoice',
      invoiceDate: String(raw.invoice_date || '').trim(),
      dueDate: String(raw.due_date || '').trim(),
      statusLabel,
      invoiceTypeLabel,
      organizationName: selectedOrganization?.org_name || 'Your Organization',
      accountName: selectedAccount?.account_name || 'Customer Account',
      contactName: selectedContact ? `${selectedContact.first_name} ${selectedContact.last_name}`.trim() : 'Contact Person',
      contactEmail: selectedContact?.primary_email || 'contact@example.com',
      headerText,
      footerText,
      descriptionText,
      terms: termsText
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean),
      subtotal: this.subtotal,
      totalTax: this.totalTax,
      grandTotal: this.grandTotal,
      items: (raw.invoice_items || []).map((item: any) => {
        const quantity = Number(item?.quantity ?? 0);
        const unitPrice = Number(item?.unit_price ?? 0);
        const taxValue = Number(item?.tax_value ?? 0);
        return {
          itemName: String(item?.item_name || '').trim() || 'Line Item',
          itemCode: String(item?.item_code || '').trim(),
          itemDetails: String(item?.item_details || '').trim(),
          quantity,
          unitPrice,
          taxValue,
          lineTotal: quantity * unitPrice + taxValue,
        };
      }),
    };
  }

  private buildPayload(): any {
    const raw = this.form.getRawValue();
    const headerText = this.resolveInvoiceContentValue(raw.invoice_header_text, this.readHeaderDefault(this.invoiceSettings));
    const footerText = this.resolveInvoiceContentValue(raw.invoice_footer_text, this.readFooterDefault(this.invoiceSettings));
    const descriptionText = this.resolveInvoiceContentValue(raw.invoice_desc_text, this.readDescriptionDefault(this.invoiceSettings));
    const termsText = this.resolveInvoiceContentValue(raw.invoice_terms_text, this.readTermsDefault(this.invoiceSettings));

    return {
      invoice_no: String(raw.invoice_no || '').trim(),
      invoice_date: raw.invoice_date,
      due_date: raw.due_date || null,
      invoice_status: Number(raw.invoice_status ?? 0),
      invoice_type: Number(raw.invoice_type ?? 0),
      invoice_header: headerText ? { text: headerText } : {},
      invoice_footer: footerText ? { text: footerText } : {},
      invoice_desc: descriptionText ? { text: descriptionText } : {},
      invoice_terms: termsText
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean),
      exchange_rate_data: {},
      discount: Number(raw.discount ?? 0),
      adjustment: Number(raw.adjustment ?? 0),
      account: this.toNumberOrNull(raw.account),
      contact: this.toNumberOrNull(raw.contact),
      deal: this.toNumberOrNull(raw.deal),
      organization: this.toNumberOrNull(raw.organization),
      public_share_enabled: !!raw.public_share_enabled,
      invoice_items: (raw.invoice_items || []).map((item: any, index: number) => ({
        item_catalog_id: this.toNumberOrNull(item?.item_catalog_id),
        item_name: String(item?.item_name || '').trim(),
        item_code: String(item?.item_code || '').trim(),
        item_details: String(item?.item_details || '').trim(),
        quantity: Number(item?.quantity ?? 0),
        unit_price: Number(item?.unit_price ?? 0),
        currency_code: String(item?.currency_code || 'INR').trim() || 'INR',
        tax_value: Number(item?.tax_value ?? 0),
        sort_order: index,
      })),
    };
  }

  create(): void {
    if (this.form.invalid || this.itemArr.length === 0) {
      this.form.markAllAsTouched();
      this.itemArr.controls.forEach((control) => control.markAllAsTouched());
      return;
    }

    this.saving = true;
    this.error = null;

    this.invoiceService.add(this.buildPayload()).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/invoices']);
      },
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err, 'Failed to create invoice.');
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

  private applyDefaultInvoiceContent(force: boolean): void {
    const patch: Record<string, string> = {};
    const defaults = {
      invoice_header_text: this.readHeaderDefault(this.invoiceSettings),
      invoice_footer_text: this.readFooterDefault(this.invoiceSettings),
      invoice_desc_text: this.readDescriptionDefault(this.invoiceSettings),
      invoice_terms_text: this.readTermsDefault(this.invoiceSettings),
    };

    (Object.keys(defaults) as Array<keyof typeof defaults>).forEach((key) => {
      const control = this.form.get(key);
      const currentValue = String(control?.value || '').trim();
      const defaultValue = defaults[key];
      if (!defaultValue) {
        return;
      }
      if (force || !currentValue) {
        patch[key] = defaultValue;
      }
    });

    if (Object.keys(patch).length > 0) {
      this.form.patchValue(patch, { emitEvent: false });
    }
  }

  private async refreshAutoInvoiceNumber(): Promise<void> {
    const requestId = ++this.invoiceNumberRequestId;
    const prefix = this.normalizePrefix(this.invoiceSettings.invoice_prefix, 'INV');
    const year = this.resolveInvoiceYear();
    const startSequence = this.toMinimumInteger(this.invoiceSettings.invoice_number_start, 1, 1);

    try {
      const matchingNumbers = await this.fetchMatchingInvoiceNumbers(prefix, year);
      if (requestId !== this.invoiceNumberRequestId) {
        return;
      }

      this.form.get('invoice_no')?.setValue(
        this.buildNextInvoiceNumber(prefix, year, startSequence, matchingNumbers),
        { emitEvent: false },
      );
    } catch {
      if (requestId !== this.invoiceNumberRequestId) {
        return;
      }

      this.form.get('invoice_no')?.setValue(
        this.buildNextInvoiceNumber(prefix, year, startSequence, []),
        { emitEvent: false },
      );
    }
  }

  private async fetchMatchingInvoiceNumbers(prefix: string, year: number): Promise<string[]> {
    const search = `${prefix}-${year}-`;
    let page = 1;
    let totalPages = 1;
    const invoiceNumbers: string[] = [];

    do {
      const response = await firstValueFrom(
        this.invoiceService.list(
          {
            'X-Limit': '100',
            'X-Page': String(page),
          },
          { search },
        ),
      );

      const list = Array.isArray(response?.list) ? response.list : [];
      totalPages = Math.max(1, Number(response?.total_pages || 1));

      list.forEach((invoice: any) => {
        const invoiceNo = String(invoice?.invoice_no || '').trim();
        if (invoiceNo) {
          invoiceNumbers.push(invoiceNo);
        }
      });

      page += 1;
    } while (page <= totalPages);

    return invoiceNumbers;
  }

  private buildNextInvoiceNumber(prefix: string, year: number, startSequence: number, invoiceNumbers: string[]): string {
    const highestExistingSequence = invoiceNumbers.reduce((max, invoiceNo) => {
      const sequence = this.extractInvoiceSequence(invoiceNo, prefix, year);
      return sequence > max ? sequence : max;
    }, 0);

    const nextSequence = Math.max(startSequence - 1, highestExistingSequence) + 1;
    return `${prefix}-${year}-${String(nextSequence).padStart(8, '0')}`;
  }

  private extractInvoiceSequence(invoiceNo: string, prefix: string, year: number): number {
    const pattern = new RegExp(`^${this.escapeRegex(prefix)}-${year}-(\\d+)$`);
    const match = pattern.exec(invoiceNo);
    if (!match) {
      return 0;
    }
    return this.toPositiveInteger(match[1], 0);
  }

  private resolveInvoiceYear(): number {
    const rawDate = String(this.form.get('invoice_date')?.value || '').trim();
    if (!rawDate) {
      return new Date().getFullYear();
    }

    const parsed = new Date(rawDate);
    const year = parsed.getFullYear();
    return Number.isFinite(year) ? year : new Date().getFullYear();
  }

  private normalizeInvoiceSettings(settings: InvoiceSettings | null | undefined): InvoiceSettings {
    const source = settings || {};
    return {
      ...source,
      invoice_prefix: this.normalizePrefix(source.invoice_prefix, 'INV'),
      receipt_prefix: this.normalizePrefix(source.receipt_prefix, 'RCP'),
      invoice_number_start: this.toMinimumInteger(
        source.invoice_number_start ?? source['invoice_suffix'] ?? this.readSequenceFromDocumentNumber(source['next_number']),
        1,
        1,
      ),
      default_header_notes: this.readSettingText(
        source.default_header_notes ?? source.default_header ?? source['invoice_header'],
      ),
      default_header: this.readSettingText(
        source.default_header_notes ?? source.default_header ?? source['invoice_header'],
      ),
      default_footer_notes: this.readSettingText(
        source.default_footer_notes ?? source.default_footer ?? source['invoice_footer'],
      ),
      default_footer: this.readSettingText(
        source.default_footer_notes ?? source.default_footer ?? source['invoice_footer'],
      ),
      default_description: this.readSettingText(source.default_description ?? source['invoice_description'] ?? source['invoice_desc']),
      default_terms: this.readSettingText(source.default_terms ?? source['invoice_terms']),
    };
  }

  private createDefaultInvoiceSettings(): InvoiceSettings {
    return {
      invoice_prefix: 'INV',
      receipt_prefix: 'RCP',
      invoice_number_start: 1,
      default_header_notes: '',
      default_footer_notes: '',
      default_description: '',
      default_terms: '',
    };
  }

  private readHeaderDefault(settings: InvoiceSettings): string {
    return this.cleanText(settings.default_header_notes ?? settings.default_header);
  }

  private readFooterDefault(settings: InvoiceSettings): string {
    return this.cleanText(settings.default_footer_notes ?? settings.default_footer);
  }

  private readDescriptionDefault(settings: InvoiceSettings): string {
    return this.cleanText(settings.default_description);
  }

  private readTermsDefault(settings: InvoiceSettings): string {
    return this.cleanText(settings.default_terms);
  }

  private resolveInvoiceContentValue(value: unknown, fallback: string): string {
    const current = this.cleanText(value);
    return current || fallback;
  }

  private cleanText(value: unknown): string {
    return String(value || '').trim();
  }

  private readSettingText(value: unknown): string {
    if (typeof value === 'string') {
      return richTextToPlainText(value);
    }
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
    return '';
  }

  private readSequenceFromDocumentNumber(value: unknown): number {
    const normalized = String(value || '').trim();
    const match = /(\d+)$/.exec(normalized);
    return match ? this.toMinimumInteger(match[1], 0, 0) : 0;
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
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private toMinimumInteger(value: unknown, fallback: number, minimum: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
