import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { DealService } from '../../../core/services/deal.service';
import { AccountService } from '../../../core/services/account.service';
import { ContactService } from '../../../core/services/contact.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type DealStatusOption = { value: number; label: string };
type DealAccountOption = {
  id: number;
  account_name: string;
  currencies?: Array<{
    id?: number | null;
    shortname?: string;
    symbol?: string;
    name?: string;
    code?: string;
  } | string>;
};
type DealContactOption = {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  accountIds: number[];
};

@Component({
  selector: 'app-deal-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './deal-edit.component.html',
  styleUrls: ['./deal-edit.component.scss'],
})
export class DealEditComponent implements OnInit {
  dealId = 0;
  loading = false;
  saving = false;
  error: string | null = null;

  form: FormGroup;
  deal: any | null = null;

  accounts: DealAccountOption[] = [];
  contacts: DealContactOption[] = [];
  filteredContacts: DealContactOption[] = [];

  readonly fallbackStatusOptions: DealStatusOption[] = [
    { value: 0, label: 'Open' },
    { value: 1, label: 'In Progress' },
    { value: 2, label: 'Won' },
    { value: 3, label: 'Lost' },
  ];
  statusOptions: DealStatusOption[] = [...this.fallbackStatusOptions];

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private dealService: DealService,
    private accountService: AccountService,
    private contactService: ContactService
  ) {
    this.form = this.fb.group({
      deal_name: ['', [Validators.required, Validators.minLength(2)]],
      deal_value: [0, [Validators.required, Validators.min(0)]],
      deal_status: [0, [Validators.required]],
      start_date: [''],
      expected_close_date: [''],
      actual_close_date: [''],
      account: [null],
      contact: [null],
      description: [''],
    });
  }

  ngOnInit(): void {
    this.dealId = Number(this.route.snapshot.paramMap.get('id'));

    this.form.get('account')?.valueChanges.subscribe(() => {
      this.syncFilteredContacts();
    });

    this.loadLookups();
    this.loadDeal();
  }

  get dealTitle(): string {
    return String(this.form.get('deal_name')?.value || '').trim() || 'Deal';
  }

  get selectedStatusLabel(): string {
    const selectedValue = Number(this.form.get('deal_status')?.value ?? 0);
    return this.statusOptions.find((option) => option.value === selectedValue)?.label || 'Open';
  }

  get accountLabel(): string {
    const accountId = this.form.get('account')?.value;
    if (accountId == null || accountId === '') return 'No account linked';
    return this.accounts.find((account) => account.id === Number(accountId))?.account_name || `Account #${accountId}`;
  }

  get contactLabelValue(): string {
    const contactId = this.form.get('contact')?.value;
    if (contactId == null || contactId === '') return 'No contact linked';
    const contact = this.contacts.find((item) => item.id === Number(contactId));
    return contact ? this.contactLabel(contact) : `Contact #${contactId}`;
  }

  get dealValueLabel(): string {
    const value = Number(this.form.get('deal_value')?.value ?? 0);
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  get selectedAccountCurrencyLabel(): string {
    const accountId = this.form.get('account')?.value;
    if (accountId == null || accountId === '') return 'No currency linked';

    const selectedAccount = this.accounts.find((account) => account.id === Number(accountId));
    const currencies = Array.isArray(selectedAccount?.currencies) ? selectedAccount.currencies : [];
    const primaryCurrency = currencies[0];

    if (!primaryCurrency) {
      return 'No currency linked';
    }

    if (typeof primaryCurrency === 'string') {
      return primaryCurrency.trim() || 'No currency linked';
    }

    const shortname = String(primaryCurrency.shortname || primaryCurrency.code || '').trim();
    const symbol = String(primaryCurrency.symbol || '').trim();
    const name = String(primaryCurrency.name || '').trim();

    if (shortname && symbol) return `${shortname} (${symbol})`;
    if (shortname) return shortname;
    if (name) return name;
    if (symbol) return symbol;
    return 'No currency linked';
  }

  resetFormData(): void {
    this.error = null;
    this.loadLookups();
    this.loadDeal();
  }

  private loadLookups(): void {
    forkJoin({
      accounts: this.accountService.list({ 'X-Limit': '100', 'X-Page': '1' }).pipe(
        map((res: any) => (Array.isArray(res?.list) ? res.list : []) as DealAccountOption[]),
        catchError(() => of([] as DealAccountOption[]))
      ),
      contacts: this.contactService.list({ 'X-Limit': '100', 'X-Page': '1' }).pipe(
        map((res: any) =>
          (Array.isArray(res?.list) ? res.list : []).map((contact: any) => ({
            id: Number(contact?.id),
            first_name: String(contact?.first_name || ''),
            last_name: String(contact?.last_name || ''),
            primary_email: String(contact?.primary_email || ''),
            accountIds: Array.isArray(contact?.account_details)
              ? contact.account_details
                  .map((account: any) => Number(account?.id))
                  .filter((id: number) => !Number.isNaN(id))
              : [],
          }))
        ),
        catchError(() => of([] as DealContactOption[]))
      ),
      statuses: this.dealService.statusChoices().pipe(
        map((res: any) => this.normalizeStatusOptions(res?.choices)),
        catchError(() => of(this.fallbackStatusOptions))
      ),
    }).subscribe({
      next: ({ accounts, contacts, statuses }) => {
        this.accounts = accounts;
        this.contacts = contacts;
        this.statusOptions = statuses;
        this.syncFilteredContacts();
      },
      error: (error) => {
        this.error = extractApiError(error, 'Failed to load deal form data.');
      },
    });
  }

  private normalizeStatusOptions(choices: unknown): DealStatusOption[] {
    if (!Array.isArray(choices)) {
      return [...this.fallbackStatusOptions];
    }

    const options = choices
      .map((choice: any) => ({
        value: Number(choice?.value),
        label: String(choice?.label || '').trim(),
      }))
      .filter((choice) => !Number.isNaN(choice.value) && choice.label);

    return options.length ? options : [...this.fallbackStatusOptions];
  }

  private syncFilteredContacts(): void {
    const selectedAccountId = this.form.get('account')?.value;
    const accountId = selectedAccountId == null || selectedAccountId === '' ? null : Number(selectedAccountId);

    if (!accountId) {
      this.filteredContacts = [...this.contacts];
      return;
    }

    this.filteredContacts = this.contacts.filter((contact) => contact.accountIds.includes(accountId));

    const selectedContactId = this.form.get('contact')?.value;
    if (
      selectedContactId != null &&
      selectedContactId !== '' &&
      !this.filteredContacts.some((contact) => contact.id === Number(selectedContactId))
    ) {
      this.form.get('contact')?.setValue(null);
    }
  }

  contactLabel(contact: DealContactOption): string {
    const name = `${contact.first_name} ${contact.last_name}`.trim();
    return name || contact.primary_email || `Contact #${contact.id}`;
  }

  private loadDeal(): void {
    if (!this.dealId) return;

    this.loading = true;
    this.error = null;

    this.dealService.get(this.dealId).subscribe({
      next: (deal: any) => {
        this.loading = false;
        this.deal = deal;
        this.form.patchValue(
          {
            deal_name: deal?.deal_name ?? '',
            deal_value: Number(deal?.deal_value ?? 0),
            deal_status: Number(deal?.deal_status ?? 0),
            start_date: deal?.start_date ?? '',
            expected_close_date: deal?.expected_close_date ?? '',
            actual_close_date: deal?.actual_close_date ?? '',
            account: deal?.account ?? null,
            contact: deal?.contact ?? null,
            description: deal?.description ?? '',
          },
          { emitEvent: false }
        );
        this.syncFilteredContacts();
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load deal.');
      },
    });
  }

  update(): void {
    if (!this.dealId) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.error = null;

    const raw = this.form.getRawValue();
    const accountId = raw.account != null ? Number(raw.account) : null;
    const contactId = raw.contact != null ? Number(raw.contact) : null;

    const payload = {
      deal_name: String(raw.deal_name || '').trim(),
      deal_value: Number(raw.deal_value ?? 0),
      deal_status: Number(raw.deal_status ?? 0),
      start_date: raw.start_date || null,
      expected_close_date: raw.expected_close_date || null,
      actual_close_date: raw.actual_close_date || null,
      description: String(raw.description || '').trim(),
      account: accountId,
      contact: contactId,
      account_ids: accountId ? [accountId] : [],
      contact_ids: contactId ? [contactId] : [],
    };

    this.dealService.update(this.dealId, payload).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/deals']);
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to update deal.');
      },
    });
  }
}
