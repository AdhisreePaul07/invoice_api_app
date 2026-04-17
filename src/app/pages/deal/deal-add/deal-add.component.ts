import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { DealService } from '../../../core/services/deal.service';
import { AccountService } from '../../../core/services/account.service';
import { ContactService } from '../../../core/services/contact.service';
import { extractApiError } from '../../../core/utils/api-error.util';

type DealStatusOption = { value: number; label: string };
type DealAccountOption = { id: number; account_name: string };
type DealContactOption = {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  accountIds: number[];
};

@Component({
  selector: 'app-deal-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './deal-add.component.html',
  styleUrls: ['./deal-add.component.scss'],
})
export class DealAddComponent implements OnInit {
  form: FormGroup;
  loading = false;
  saving = false;
  error: string | null = null;

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
    private dealService: DealService,
    private accountService: AccountService,
    private contactService: ContactService,
    private router: Router
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
    this.loadFormData();

    this.form.get('account')?.valueChanges.subscribe(() => {
      this.syncFilteredContacts();
    });
  }

  resetFormData(): void {
    this.error = null;
    this.form.reset(
      {
        deal_name: '',
        deal_value: 0,
        deal_status: 0,
        start_date: '',
        expected_close_date: '',
        actual_close_date: '',
        account: null,
        contact: null,
        description: '',
      },
      { emitEvent: false }
    );
    this.syncFilteredContacts();
  }

  private loadFormData(): void {
    this.loading = true;
    this.error = null;

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
      statuses: this.dealService
        .statusChoices()
        .pipe(
          map((res: any) => this.normalizeStatusOptions(res?.choices)),
          catchError(() => of(this.fallbackStatusOptions))
        ),
    }).subscribe({
      next: ({ accounts, contacts, statuses }) => {
        this.accounts = accounts;
        this.contacts = contacts;
        this.statusOptions = statuses;
        this.syncFilteredContacts();
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to load deal form data.');
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

  create(): void {
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

    this.dealService.add(payload).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/deals']);
      },
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err, 'Failed to create deal.');
      },
    });
  }
}
