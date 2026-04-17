import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';

import { AccountService } from '../../../core/services/account.service';
import { ContactService } from '../../../core/services/contact.service';
import { DealService } from '../../../core/services/deal.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { ItemService } from '../../../core/services/item.service';
import { OrgStateService } from '../../../core/services/org-state.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type InvoiceSectionKey = 'overview' | 'relationships' | 'items' | 'financials' | 'notes';
type SectionFeedback = { type: 'success' | 'error'; message: string };

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
  selector: 'app-invoice-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './invoice-edit.component.html',
  styleUrls: ['./invoice-edit.component.scss'],
})
export class InvoiceEditComponent implements OnInit {
  form: FormGroup;
  loading = false;
  error: string | null = null;
  invoiceId = 0;
  invoice: any | null = null;

  accounts: InvoiceAccountOption[] = [];
  contacts: InvoiceContactOption[] = [];
  deals: InvoiceDealOption[] = [];
  items: any[] = [];
  organizations: InvoiceOrganizationOption[] = [];

  filteredContacts: InvoiceContactOption[] = [];
  filteredDeals: InvoiceDealOption[] = [];

  sectionSaving: Record<InvoiceSectionKey, boolean> = {
    overview: false,
    relationships: false,
    items: false,
    financials: false,
    notes: false,
  };
  sectionFeedback: Partial<Record<InvoiceSectionKey, SectionFeedback>> = {};

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
    private accountService: AccountService,
    private contactService: ContactService,
    private dealService: DealService,
    private itemService: ItemService,
    private invoiceService: InvoiceService,
    private orgState: OrgStateService
  ) {
    this.form = this.fb.group({
      invoice_no: ['', [Validators.required]],
      invoice_date: ['', [Validators.required]],
      due_date: [''],
      invoice_status: [0, [Validators.required]],
      invoice_type: [0, [Validators.required]],
      account: [null, [Validators.required]],
      contact: [null],
      deal: [null],
      organization: [null],
      discount_percent: [0, [Validators.min(0)]],
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
    this.invoiceId = Number(this.route.snapshot.paramMap.get('id'));

    this.form.get('account')?.valueChanges.subscribe(() => {
      this.syncFilteredRelationships();
    });

    this.form.get('contact')?.valueChanges.subscribe(() => {
      this.syncFilteredRelationships();
    });

    this.loadLookups();
    this.loadInvoice();
  }

  get itemArr(): FormArray {
    return this.form.get('invoice_items') as FormArray;
  }

  get pageTitle(): string {
    return String(this.form.get('invoice_no')?.value || '').trim() || 'Invoice';
  }

  get invoiceTypeLabel(): string {
    const selectedValue = Number(this.form.get('invoice_type')?.value ?? 0);
    return this.invoiceTypeOptions.find((option) => option.value === selectedValue)?.label || 'Standard';
  }

  get invoiceStatusLabel(): string {
    const selectedValue = Number(this.form.get('invoice_status')?.value ?? 0);
    return this.invoiceStatusOptions.find((option) => option.value === selectedValue)?.label || 'Draft';
  }

  get organizationLabel(): string {
    const organizationId = this.toNumberOrNull(this.form.get('organization')?.value);
    if (organizationId) {
      return this.organizations.find((organization) => organization.id === organizationId)?.org_name || `Organization #${organizationId}`;
    }

    const snapshot = this.invoice?.organization_snapshot;
    return String(snapshot?.org_name || snapshot?.organization_name || '').trim() || 'No organization selected';
  }

  get accountLabel(): string {
    const accountId = this.toNumberOrNull(this.form.get('account')?.value);
    if (accountId) {
      return this.accounts.find((account) => account.id === accountId)?.account_name || `Account #${accountId}`;
    }

    const snapshot = this.invoice?.account_snapshot;
    return String(snapshot?.account_name || '').trim() || 'No account linked';
  }

  get contactLabel(): string {
    const contactId = this.toNumberOrNull(this.form.get('contact')?.value);
    if (contactId) {
      const contact = this.contacts.find((option) => option.id === contactId);
      return contact ? this.contactOptionLabel(contact) : `Contact #${contactId}`;
    }

    const snapshot = this.invoice?.contact_snapshot;
    const name = `${snapshot?.first_name || ''} ${snapshot?.last_name || ''}`.trim();
    return name || String(snapshot?.primary_email || '').trim() || 'No contact linked';
  }

  get dealLabel(): string {
    const dealId = this.toNumberOrNull(this.form.get('deal')?.value);
    if (dealId) {
      return this.filteredDeals.find((deal) => deal.id === dealId)?.deal_name
        || this.deals.find((deal) => deal.id === dealId)?.deal_name
        || `Deal #${dealId}`;
    }

    const snapshot = this.invoice?.deal_snapshot;
    return String(snapshot?.deal_name || '').trim() || 'No deal linked';
  }

  get invoiceDateLabel(): string {
    return String(this.form.get('invoice_date')?.value || '').trim() || 'Not set';
  }

  get dueDateLabel(): string {
    return String(this.form.get('due_date')?.value || '').trim() || 'Not set';
  }

  get discountAmount(): number {
    const percent = Number(this.form.get('discount_percent')?.value ?? 0);
    return (this.subtotal * percent) / 100;
  }

  get subtotal(): number {
    return this.itemArr.controls.reduce((sum, _row, index) => sum + this.lineSubtotal(index), 0);
  }

  get totalTax(): number {
    return this.itemArr.controls.reduce((sum, row) => sum + Number(row.get('tax_value')?.value ?? 0), 0);
  }

  get grandTotal(): number {
    const adjustment = Number(this.form.get('adjustment')?.value ?? 0);
    return this.subtotal + this.totalTax - this.discountAmount + adjustment;
  }

  get isAnySectionSaving(): boolean {
    return Object.values(this.sectionSaving).some(Boolean);
  }

  resetFormData(): void {
    this.error = null;
    this.sectionFeedback = {};
    this.loadInvoice();
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

  lineSubtotal(index: number): number {
    const row = this.itemArr.at(index)?.getRawValue();
    return Number(row?.quantity ?? 0) * Number(row?.unit_price ?? 0);
  }

  lineTotal(index: number): number {
    const row = this.itemArr.at(index)?.getRawValue();
    return this.lineSubtotal(index) + Number(row?.tax_value ?? 0);
  }

  feedbackFor(section: InvoiceSectionKey): SectionFeedback | null {
    return this.sectionFeedback[section] ?? null;
  }

  saveOverviewSection(): void {
    const controls = ['invoice_no', 'invoice_type', 'invoice_date', 'due_date', 'invoice_status'];
    const hasInvalidControl = controls.some((name) => this.form.get(name)?.invalid);
    if (hasInvalidControl) {
      controls.forEach((name) => this.form.get(name)?.markAsTouched());
      return;
    }

    this.updateSection('overview', this.buildOverviewPayload(), 'Invoice details updated successfully.');
  }

  saveRelationshipsSection(): void {
    const accountControl = this.form.get('account');
    if (accountControl?.invalid) {
      accountControl.markAsTouched();
      return;
    }

    this.updateSection('relationships', this.buildRelationshipsPayload(), 'Invoice relationships updated successfully.');
  }

  saveItemsSection(): void {
    if (this.itemArr.invalid || this.itemArr.length === 0) {
      this.itemArr.controls.forEach((control) => control.markAllAsTouched());
      return;
    }

    this.updateSection('items', this.buildItemsPayload(), 'Invoice items updated successfully.');
  }

  saveFinancialsSection(): void {
    this.updateSection('financials', this.buildFinancialPayload(), 'Financial adjustments updated successfully.');
  }

  saveNotesSection(): void {
    this.updateSection('notes', this.buildNotesPayload(), 'Invoice notes and sharing settings updated successfully.');
  }

  private makeItemGroup(value?: any): FormGroup {
    return this.fb.group({
      item_catalog_id: [value?.item_catalog_id ?? value?.item_catalog?.id ?? value?.item_catalog ?? null],
      item_name: [value?.item_name ?? '', [Validators.required]],
      item_code: [value?.item_code ?? ''],
      item_details: [value?.item_details ?? ''],
      quantity: [value?.quantity ?? 1, [Validators.required, Validators.min(0.01)]],
      unit_price: [value?.unit_price ?? 0, [Validators.required, Validators.min(0)]],
      currency_code: [value?.currency_code ?? 'INR', [Validators.required]],
      tax_value: [value?.tax_value ?? 0, [Validators.min(0)]],
    });
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
      if (org?.id && !this.form.get('organization')?.value) {
        this.form.patchValue({ organization: org.id }, { emitEvent: false });
      }
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

  private loadInvoice(showLoader = true): void {
    if (!this.invoiceId) return;

    if (showLoader) {
      this.loading = true;
    }
    this.error = null;

    this.invoiceService.get(this.invoiceId).subscribe({
      next: (invoice: any) => {
        this.loading = false;
        this.invoice = invoice;

        const invoiceItems = Array.isArray(invoice?.invoice_items) ? invoice.invoice_items : [];
        const invoiceSubtotal = Number(invoice?.sub_total ?? this.calculateRawSubtotal(invoiceItems));
        const invoiceDiscount = Number(invoice?.discount ?? 0);
        const discountPercent = invoiceSubtotal > 0 ? Number(((invoiceDiscount / invoiceSubtotal) * 100).toFixed(2)) : 0;

        this.form.patchValue(
          {
            invoice_no: invoice?.invoice_no ?? '',
            invoice_date: this.dateOnly(invoice?.invoice_date),
            due_date: this.dateOnly(invoice?.due_date),
            invoice_status: Number(invoice?.invoice_status ?? 0),
            invoice_type: Number(invoice?.invoice_type ?? 0),
            account: invoice?.account ?? null,
            contact: invoice?.contact ?? null,
            deal: invoice?.deal ?? null,
            organization: invoice?.organization ?? this.form.get('organization')?.value ?? null,
            discount_percent: discountPercent,
            adjustment: Number(invoice?.adjustment ?? 0),
            public_share_enabled: !!invoice?.public_share_enabled,
            invoice_header_text: this.readTextBlock(invoice?.invoice_header),
            invoice_footer_text: this.readTextBlock(invoice?.invoice_footer),
            invoice_desc_text: this.readTextBlock(invoice?.invoice_desc),
            invoice_terms_text: this.readTermsText(invoice?.invoice_terms),
          },
          { emitEvent: false }
        );

        this.resetItems(invoiceItems);
        this.syncFilteredRelationships();
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load invoice.');
      },
    });
  }

  private resetItems(items: any[]): void {
    while (this.itemArr.length) {
      this.itemArr.removeAt(0);
    }

    (items || []).forEach((item) => this.itemArr.push(this.makeItemGroup(item)));

    if (!this.itemArr.length) {
      this.itemArr.push(this.makeItemGroup());
    }
  }

  private buildOverviewPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      invoice_no: String(raw.invoice_no || '').trim(),
      invoice_type: Number(raw.invoice_type ?? 0),
      invoice_date: raw.invoice_date,
      due_date: raw.due_date || null,
      invoice_status: Number(raw.invoice_status ?? 0),
    };
  }

  private buildRelationshipsPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      organization: this.toNumberOrNull(raw.organization),
      account: this.toNumberOrNull(raw.account),
      contact: this.toNumberOrNull(raw.contact),
      deal: this.toNumberOrNull(raw.deal),
    };
  }

  private buildItemsPayload(): Record<string, unknown> {
    return {
      invoice_items: this.buildInvoiceItems(),
    };
  }

  private buildFinancialPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      discount: this.discountAmount,
      adjustment: Number(raw.adjustment ?? 0),
    };
  }

  private buildNotesPayload(): Record<string, unknown> {
    const raw = this.form.getRawValue();
    return {
      invoice_header: raw.invoice_header_text ? { text: String(raw.invoice_header_text).trim() } : {},
      invoice_footer: raw.invoice_footer_text ? { text: String(raw.invoice_footer_text).trim() } : {},
      invoice_desc: raw.invoice_desc_text ? { text: String(raw.invoice_desc_text).trim() } : {},
      invoice_terms: String(raw.invoice_terms_text || '')
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean),
      public_share_enabled: !!raw.public_share_enabled,
    };
  }

  private buildInvoiceItems(): Array<Record<string, unknown>> {
    const raw = this.form.getRawValue();
    return (raw.invoice_items || []).map((item: any, index: number) => ({
      item_catalog_id: this.toNumberOrNull(item?.item_catalog_id),
      item_name: String(item?.item_name || '').trim(),
      item_code: String(item?.item_code || '').trim(),
      item_details: String(item?.item_details || '').trim(),
      quantity: Number(item?.quantity ?? 0),
      unit_price: Number(item?.unit_price ?? 0),
      currency_code: String(item?.currency_code || 'INR').trim() || 'INR',
      tax_value: Number(item?.tax_value ?? 0),
      sort_order: index,
    }));
  }

  private updateSection(section: InvoiceSectionKey, payload: Record<string, unknown>, successMessage: string): void {
    if (!this.invoiceId) return;

    this.sectionSaving[section] = true;
    delete this.sectionFeedback[section];
    this.error = null;

    this.invoiceService.update(this.invoiceId, payload).subscribe({
      next: () => {
        this.sectionSaving[section] = false;
        this.sectionFeedback[section] = { type: 'success', message: successMessage };
        this.loadInvoice(false);
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

  private readTextBlock(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (value && typeof value === 'object') {
      const text = (value as Record<string, unknown>)['text'];
      return typeof text === 'string' ? text.trim() : '';
    }

    return '';
  }

  private readTermsText(value: unknown): string {
    if (!Array.isArray(value)) return '';

    return value
      .map((entry: unknown) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          if (typeof record['text'] === 'string') return record['text'].trim();
          if (typeof record['value'] === 'string') return record['value'].trim();
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private contactOptionLabel(contact: InvoiceContactOption): string {
    const name = `${contact.first_name} ${contact.last_name}`.trim();
    return name || contact.primary_email || `Contact #${contact.id}`;
  }

  private calculateRawSubtotal(items: any[]): number {
    return (items || []).reduce((sum, item) => {
      const quantity = Number(item?.quantity ?? 0);
      const unitPrice = Number(item?.unit_price ?? 0);
      return sum + (quantity * unitPrice);
    }, 0);
  }
}
