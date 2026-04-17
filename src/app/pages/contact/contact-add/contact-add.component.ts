import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ContactService } from '../../../core/services/contact.service';
import { AccountService } from '../../../core/services/account.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { formatFileSize, validateImageFile } from '../../../core/utils/image-upload.util';
import { ImageUploadFieldComponent } from '../../../shared/components/image-upload-field/image-upload-field.component';

type AccountLite = { id: number; name: string };

@Component({
  selector: 'app-contact-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ImageUploadFieldComponent],
  templateUrl: './contact-add.component.html',
  styleUrls: ['./contact-add.component.scss'],
})
export class ContactAddComponent implements OnInit, OnDestroy {
  form: FormGroup;

  saving = false;
  error: string | null = null;

  accountSearchCtrl = new FormControl<string>('', { nonNullable: true });
  accountDropdownOpen = false;
  accountMaster: AccountLite[] = [];
  accountResults: AccountLite[] = [];
  selectedAccounts: AccountLite[] = [];
  profileImageFile: File | null = null;
  profileImagePreviewUrl = '';
  profileImageError: string | null = null;
  private profileImageObjectUrl = '';
  readonly trackByIndex = (index: number): number => index;

  constructor(
    private fb: FormBuilder,
    private contactService: ContactService,
    private accountService: AccountService,
    private router: Router
  ) {
    this.form = this.fb.group({
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      last_name: [''],
      primary_email: ['', [Validators.required, Validators.email]],
      primary_phone: [''],
      designation: [''],
      notes: [''],
      secondary_emails: this.fb.array([]),
      secondary_phones: this.fb.array([]),
      account_ids: this.fb.control<number[]>([], { nonNullable: true }),
    });
  }

  ngOnDestroy(): void {
    this.clearProfileImageDraft();
  }

  ngOnInit(): void {
    this.loadAccounts();

    this.accountSearchCtrl.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((term) => {
        this.accountResults = this.computeAccountResults(term);
      });
  }

  get secondaryEmailArr(): FormArray {
    return this.form.get('secondary_emails') as FormArray;
  }

  get secondaryPhoneArr(): FormArray {
    return this.form.get('secondary_phones') as FormArray;
  }

  get displayName(): string {
    return [
      String(this.form.get('first_name')?.value || '').trim(),
      String(this.form.get('last_name')?.value || '').trim(),
    ]
      .filter(Boolean)
      .join(' ') || 'New Contact';
  }

  get profileImageFileName(): string {
    return this.profileImageFile?.name || '';
  }

  get profileImageMeta(): string {
    if (!this.profileImageFile) {
      return '';
    }

    const extension = String(this.profileImageFile.name || '').split('.').pop()?.toUpperCase() || '';
    return [formatFileSize(this.profileImageFile.size), extension].filter(Boolean).join(' | ');
  }

  addSecondaryEmail(): void {
    this.secondaryEmailArr.push(this.fb.control('', [Validators.email]));
  }

  removeSecondaryEmail(index: number): void {
    this.secondaryEmailArr.removeAt(index);
  }

  addSecondaryPhone(): void {
    this.secondaryPhoneArr.push(this.fb.control(''));
  }

  removeSecondaryPhone(index: number): void {
    this.secondaryPhoneArr.removeAt(index);
  }

  resetFormData(): void {
    this.error = null;
    this.clearProfileImageDraft();
    this.selectedAccounts = [];
    this.accountSearchCtrl.setValue('', { emitEvent: false });

    while (this.secondaryEmailArr.length) {
      this.secondaryEmailArr.removeAt(this.secondaryEmailArr.length - 1);
    }

    while (this.secondaryPhoneArr.length) {
      this.secondaryPhoneArr.removeAt(this.secondaryPhoneArr.length - 1);
    }

    this.form.reset(
      {
        first_name: '',
        last_name: '',
        primary_email: '',
        primary_phone: '',
        designation: '',
        notes: '',
        account_ids: [],
      },
      { emitEvent: false }
    );

    this.patchAccountIds();
    this.accountResults = this.computeAccountResults('');
  }

  private loadAccounts(): void {
    this.accountService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.list) ? res.list : [];
        this.accountMaster = list.map((account: any) => ({
          id: Number(account.id),
          name: String(account.account_name || ''),
        }));
        this.accountResults = this.computeAccountResults('');
      },
      error: () => {
        this.accountMaster = [];
        this.accountResults = [];
      },
    });
  }

  private computeAccountResults(term: string): AccountLite[] {
    const query = (term || '').trim().toLowerCase();
    const selectedIds = new Set(this.selectedAccounts.map((account) => account.id));
    const available = this.accountMaster.filter((account) => !selectedIds.has(account.id));

    if (!query) return available.slice(0, 10);

    return available
      .filter((account) => account.name.toLowerCase().includes(query))
      .slice(0, 50);
  }

  openAccountDropdown(): void {
    this.accountDropdownOpen = true;
    this.accountResults = this.computeAccountResults(this.accountSearchCtrl.value);
  }

  closeAccountDropdownSoon(): void {
    setTimeout(() => {
      this.accountDropdownOpen = false;
    }, 150);
  }

  selectAccount(account: AccountLite): void {
    if (!this.selectedAccounts.some((entry) => entry.id === account.id)) {
      this.selectedAccounts = [...this.selectedAccounts, account];
    }
    this.patchAccountIds();
    this.accountSearchCtrl.setValue('', { emitEvent: true });
    this.accountDropdownOpen = false;
  }

  removeAccount(index: number): void {
    this.selectedAccounts = this.selectedAccounts.filter((_, idx) => idx !== index);
    this.patchAccountIds();
    this.accountResults = this.computeAccountResults(this.accountSearchCtrl.value);
  }

  private patchAccountIds(): void {
    this.form.get('account_ids')?.setValue(this.selectedAccounts.map((account) => account.id), { emitEvent: false });
  }

  goToAddAccount(): void {
    this.accountDropdownOpen = false;
    void this.router.navigate(['/accounts/add']);
  }

  onProfileImageSelected(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.profileImageError = validationError;
      return;
    }

    this.profileImageError = null;
    this.revokeProfileImageObjectUrl();
    this.profileImageFile = file;
    this.profileImageObjectUrl = URL.createObjectURL(file);
    this.profileImagePreviewUrl = this.profileImageObjectUrl;
  }

  removeProfileImageSelection(): void {
    this.clearProfileImageDraft();
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
      first_name: String(raw.first_name || '').trim(),
      last_name: String(raw.last_name || '').trim(),
      primary_email: String(raw.primary_email || '').trim(),
      primary_phone: String(raw.primary_phone || '').trim(),
      designation: String(raw.designation || '').trim(),
      notes: String(raw.notes || '').trim(),
      secondary_emails: (raw.secondary_emails || [])
        .map((email: unknown) => String(email || '').trim())
        .filter(Boolean),
      secondary_phones: (raw.secondary_phones || [])
        .map((phone: unknown) => String(phone || '').trim())
        .filter(Boolean),
      account_ids: raw.account_ids ?? [],
    };

    this.contactService.add(payload).subscribe({
      next: (created: any) => {
        const createdId = Number(created?.id ?? 0);
        if (this.profileImageFile && createdId > 0) {
          this.contactService.uploadProfileImage(createdId, this.profileImageFile).subscribe({
            next: () => {
              this.saving = false;
              this.clearProfileImageDraft();
              void this.router.navigate(['/contacts']);
            },
            error: () => {
              this.saving = false;
              this.clearProfileImageDraft();
              void this.router.navigate(['/contacts/edit', createdId], {
                queryParams: { imageUpload: 'failed' },
              });
            },
          });
          return;
        }

        this.saving = false;
        this.clearProfileImageDraft();
        void this.router.navigate(['/contacts']);
      },
      error: (err: any) => {
        this.saving = false;
        this.error = extractApiError(err, 'Failed to create contact.');
      },
    });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.search-select')) {
      this.accountDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.accountDropdownOpen = false;
  }

  private clearProfileImageDraft(): void {
    this.revokeProfileImageObjectUrl();
    this.profileImageFile = null;
    this.profileImagePreviewUrl = '';
    this.profileImageError = null;
  }

  private revokeProfileImageObjectUrl(): void {
    if (this.profileImageObjectUrl) {
      URL.revokeObjectURL(this.profileImageObjectUrl);
      this.profileImageObjectUrl = '';
    }
  }
}
