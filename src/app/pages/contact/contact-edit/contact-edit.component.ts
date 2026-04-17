import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ContactService } from '../../../core/services/contact.service';
import { AccountService } from '../../../core/services/account.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { formatFileSize, formatImageAssetMeta, imageUrl, validateImageFile } from '../../../core/utils/image-upload.util';

type AccountLite = { id: number; name: string };

@Component({
  selector: 'app-contact-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './contact-edit.component.html',
  styleUrls: ['./contact-edit.component.scss'],
})
export class ContactEditComponent implements OnInit {
  private readonly cropViewportSize = 320;
  private readonly cropMaxZoom = 3;
  form: FormGroup;

  loading = false;
  saving = false;
  error: string | null = null;
  contactId = 0;
  contact: any | null = null;

  accountSearchCtrl = new FormControl<string>('', { nonNullable: true });
  accountDropdownOpen = false;
  accountMaster: AccountLite[] = [];
  accountResults: AccountLite[] = [];
  selectedAccounts: AccountLite[] = [];
  profileImageUploading = false;
  profileImageRemoving = false;
  profileImageError: string | null = null;
  profileImageSuccess: string | null = null;
  profileImageModalOpen = false;
  profileImageDraftUrl = '';
  selectedProfileImageFile: File | null = null;
  cropZoom = 1;
  cropMinZoom = 1;
  cropOffsetX = 0;
  cropOffsetY = 0;
  cropImageWidth = 0;
  cropImageHeight = 0;
  cropSaving = false;
  cropPreparing = false;
  straighten = 0;
  isCropDragging = false;
  private cropDragStartX = 0;
  private cropDragStartY = 0;
  private cropStartOffsetX = 0;
  private cropStartOffsetY = 0;
  uploadNotice: string | null = null;

  readonly trackByIndex = (index: number): number => index;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private contactService: ContactService,
    private accountService: AccountService
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

  ngOnInit(): void {
    this.contactId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.route.snapshot.queryParamMap.get('imageUpload') === 'failed') {
      this.uploadNotice = 'Contact was created, but the profile image upload failed. You can retry it below.';
    }
    this.loadAccounts();
    this.loadContact();

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
    const first = String(this.form.get('first_name')?.value || '').trim();
    const last = String(this.form.get('last_name')?.value || '').trim();
    return `${first} ${last}`.trim() || String(this.form.get('primary_email')?.value || 'Contact');
  }

  get contactMeta(): string {
    return String(this.form.get('designation')?.value || '').trim() || 'Contact Profile';
  }

  get profileImageUrl(): string {
    return imageUrl(this.contact?.profile_image);
  }

  get profileImageFileName(): string {
    return String(this.contact?.profile_image?.original_name || '').trim();
  }

  get profileImageMeta(): string {
    return formatImageAssetMeta(this.contact?.profile_image);
  }

  get activeProfileImageFileName(): string {
    return this.selectedProfileImageFile?.name || this.profileImageFileName || 'No photo uploaded yet';
  }

  get activeProfileImageMeta(): string {
    if (this.selectedProfileImageFile) {
      const extension = String(this.selectedProfileImageFile.name || '').split('.').pop()?.toUpperCase() || '';
      return [formatFileSize(this.selectedProfileImageFile.size), extension].filter(Boolean).join(' | ');
    }

    return this.profileImageMeta || 'Upload PNG, JPG, WEBP, or SVG up to 5MB.';
  }

  get profileImageActionBusy(): boolean {
    return this.profileImageUploading || this.profileImageRemoving || this.cropSaving || this.cropPreparing;
  }

  get activeProfileImageUrl(): string {
    return this.profileImageDraftUrl || this.profileImageUrl;
  }

  get isCropDraftActive(): boolean {
    return !!this.profileImageDraftUrl;
  }

  get cropButtonLabel(): string {
    if (this.cropPreparing) {
      return 'Opening...';
    }

    return 'Edit';
  }

  get updateButtonLabel(): string {
    if (this.profileImageUploading || this.cropSaving) {
      return 'Updating...';
    }

    return this.profileImageUrl ? 'Update' : 'Upload';
  }

  get cropImageStyle(): Record<string, string> {
    return {
      width: `${this.cropImageWidth}px`,
      height: `${this.cropImageHeight}px`,
      left: `calc(50% + ${this.cropOffsetX}px)`,
      top: `calc(50% + ${this.cropOffsetY}px)`,
      transform: `translate(-50%, -50%) scale(${this.cropZoom}) rotate(${this.straighten}deg)`,
    };
  }

  get imageModalTitle(): string {
    return this.isCropDraftActive ? 'Edit image' : 'Contact image';
  }

  get avatarInitials(): string {
    return (((this.form.get('first_name')?.value?.[0] || '') + (this.form.get('last_name')?.value?.[0] || '')).toUpperCase() || 'CT');
  }

  openProfileImageModal(): void {
    this.profileImageModalOpen = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
  }

  closeProfileImageModal(): void {
    this.profileImageModalOpen = false;
    this.cancelCropDraft();
  }

  handleProfileImageFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0);
    if (file) {
      this.prepareProfileImageDraft(file);
    }

    if (input) {
      input.value = '';
    }
  }

  prepareProfileImageDraft(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.profileImageError = validationError;
      this.profileImageSuccess = null;
      this.profileImageModalOpen = true;
      return;
    }

    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.profileImageModalOpen = true;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '').trim();
      if (!result) {
        this.profileImageError = 'Failed to read the selected image.';
        return;
      }

      const image = new Image();
      image.onload = () => {
        const baseScale = Math.max(this.cropViewportSize / image.width, this.cropViewportSize / image.height);
        this.selectedProfileImageFile = file;
        this.profileImageDraftUrl = result;
        this.cropImageWidth = image.width * baseScale;
        this.cropImageHeight = image.height * baseScale;
        this.cropMinZoom = 1;
        this.cropZoom = 1;
        this.cropOffsetX = 0;
        this.cropOffsetY = 0;
        this.straighten = 0;
        this.cropPreparing = false;
      };
      image.onerror = () => {
        this.cropPreparing = false;
        this.profileImageError = 'Failed to load the selected image.';
      };
      image.src = result;
    };
    reader.onerror = () => {
      this.cropPreparing = false;
      this.profileImageError = 'Failed to read the selected image.';
    };
    reader.readAsDataURL(file);
  }

  handleCropAction(): void {
    if (this.isCropDraftActive) {
      this.profileImageError = null;
      this.profileImageSuccess = null;
      return;
    }

    this.prepareExistingProfileImageDraft();
  }

  handleUpdateAction(fileInput: HTMLInputElement): void {
    if (this.isCropDraftActive) {
      this.saveCroppedProfileImage();
      return;
    }

    fileInput.click();
  }

  saveCroppedProfileImage(): void {
    if (!this.selectedProfileImageFile || !this.profileImageDraftUrl) {
      return;
    }

    this.cropSaving = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;

    this.buildCroppedProfileImageFile()
      .then((croppedFile) => {
        this.cropSaving = false;
        this.uploadProfileImage(croppedFile);
      })
      .catch(() => {
        this.cropSaving = false;
        this.profileImageError = 'Failed to crop the selected image.';
      });
  }

  onCropZoomChange(value: string): void {
    const numericValue = Number(value);
    this.cropZoom = Number.isFinite(numericValue) ? Math.max(this.cropMinZoom, Math.min(this.cropMaxZoom, numericValue)) : 1;
    this.clampCropOffsets();
  }

  onCropWheel(event: WheelEvent): void {
    if (!this.profileImageDraftUrl) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    this.cropZoom = Math.max(this.cropMinZoom, Math.min(this.cropMaxZoom, this.cropZoom + delta));
    this.clampCropOffsets();
  }

  onStraightenChange(value: string): void {
    const numericValue = Number(value);
    this.straighten = Number.isFinite(numericValue) ? this.clamp(numericValue, -15, 15) : 0;
  }

  startCropDrag(event: MouseEvent | TouchEvent): void {
    if (!this.profileImageDraftUrl) {
      return;
    }

    const point = this.extractPoint(event);
    this.isCropDragging = true;
    this.cropDragStartX = point.x;
    this.cropDragStartY = point.y;
    this.cropStartOffsetX = this.cropOffsetX;
    this.cropStartOffsetY = this.cropOffsetY;
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    this.handleCropDragMove(event);
  }

  @HostListener('window:touchmove', ['$event'])
  onWindowTouchMove(event: TouchEvent): void {
    this.handleCropDragMove(event);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onWindowDragEnd(): void {
    if (!this.isCropDragging) {
      return;
    }

    this.isCropDragging = false;
  }

  cancelCropDraft(): void {
    this.profileImageDraftUrl = '';
    this.selectedProfileImageFile = null;
    this.cropZoom = 1;
    this.cropMinZoom = 1;
    this.cropOffsetX = 0;
    this.cropOffsetY = 0;
    this.cropImageWidth = 0;
    this.cropImageHeight = 0;
    this.cropPreparing = false;
    this.straighten = 0;
    this.isCropDragging = false;
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
    this.accountSearchCtrl.setValue('', { emitEvent: false });
    this.loadAccounts();
    this.loadContact();
  }

  private resetArray(arr: FormArray, values: string[]): void {
    while (arr.length) arr.removeAt(0);
    (values || []).forEach((value) => arr.push(this.fb.control(value)));
  }

  private loadContact(): void {
    if (!this.contactId) return;

    this.loading = true;
    this.error = null;

    this.contactService.get(this.contactId).subscribe({
      next: (contact: any) => {
        this.loading = false;
        this.contact = contact;
        this.form.patchValue(
          {
            first_name: contact?.first_name ?? '',
            last_name: contact?.last_name ?? '',
            primary_email: contact?.primary_email ?? '',
            primary_phone: contact?.primary_phone ?? '',
            designation: contact?.designation ?? '',
            notes: contact?.notes ?? '',
          },
          { emitEvent: false }
        );

        this.resetArray(
          this.secondaryEmailArr,
          (contact?.secondary_emails ?? []).map((email: unknown) => String(email || '').trim()).filter(Boolean)
        );

        this.resetArray(
          this.secondaryPhoneArr,
          (contact?.secondary_phones ?? []).map((phone: unknown) => String(phone || '').trim()).filter(Boolean)
        );

        const accountDetails = Array.isArray(contact?.account_details) ? contact.account_details : [];
        const accountIds = Array.isArray(contact?.account_ids) ? contact.account_ids : [];
        if (accountDetails.length) {
          this.selectedAccounts = accountDetails.map((account: any) => ({
            id: Number(account.id),
            name: String(account.account_name || ''),
          }));
        } else if (accountIds.length) {
          this.selectedAccounts = accountIds.map((id: number) => {
            const existing = this.accountMaster.find((account) => account.id === Number(id));
            return existing || { id: Number(id), name: `Account #${id}` };
          });
        } else {
          this.selectedAccounts = [];
        }

        this.patchAccountIds();
      },
      error: (error: any) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load contact.');
      },
    });
  }

  private loadAccounts(): void {
    this.accountService.list({ 'X-Limit': '100', 'X-Page': '1' }).subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.list) ? res.list : [];
        this.accountMaster = list.map((account: any) => ({
          id: Number(account.id),
          name: String(account.account_name || ''),
        }));

        this.selectedAccounts = this.selectedAccounts.map((selected) => {
          const existing = this.accountMaster.find((account) => account.id === selected.id);
          return existing || selected;
        });

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

  uploadProfileImage(file: File): void {
    const validationError = validateImageFile(file);
    if (validationError) {
      this.profileImageError = validationError;
      this.profileImageSuccess = null;
      return;
    }

    if (!this.contactId) {
      return;
    }

    this.profileImageUploading = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.uploadNotice = null;

    this.contactService.uploadProfileImage(this.contactId, file).subscribe({
      next: (response) => {
        this.profileImageUploading = false;
        this.contact = response?.contact || { ...(this.contact || {}), profile_image: response?.profile_image || null };
        this.profileImageSuccess = response?.message || 'Contact profile image updated successfully.';
        this.cancelCropDraft();
        this.profileImageModalOpen = true;
      },
      error: (error: any) => {
        this.profileImageUploading = false;
        this.profileImageError = extractApiError(error, 'Failed to update the contact profile image.');
        this.profileImageModalOpen = true;
      },
    });
  }

  deleteProfileImage(): void {
    if (this.profileImageDraftUrl) {
      this.cancelCropDraft();
      return;
    }

    if (!this.contactId || !this.profileImageUrl) {
      return;
    }

    this.profileImageRemoving = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.uploadNotice = null;

    this.contactService.deleteProfileImage(this.contactId).subscribe({
      next: (response) => {
        this.profileImageRemoving = false;
        this.contact = response?.contact || { ...(this.contact || {}), profile_image: null };
        this.profileImageSuccess = response?.message || 'Contact profile image deleted successfully.';
        this.profileImageModalOpen = true;
      },
      error: (error: any) => {
        this.profileImageRemoving = false;
        this.profileImageError = extractApiError(error, 'Failed to delete the contact profile image.');
        this.profileImageModalOpen = true;
      },
    });
  }

  private async buildCroppedProfileImageFile(): Promise<File> {
    const image = await this.loadImage(this.profileImageDraftUrl);
    const outputSize = 800;
    const exportScale = outputSize / this.cropViewportSize;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas not supported');
    }

    context.save();
    context.translate(outputSize / 2 + this.cropOffsetX * exportScale, outputSize / 2 + this.cropOffsetY * exportScale);
    context.rotate((this.straighten * Math.PI) / 180);
    context.scale((this.cropImageWidth / image.width) * this.cropZoom * exportScale, (this.cropImageHeight / image.height) * this.cropZoom * exportScale);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    context.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error('Failed to export image'));
      }, 'image/png');
    });

    return new File([blob], this.buildCroppedFileName(this.selectedProfileImageFile?.name), { type: 'image/png' });
  }

  private buildCroppedFileName(originalName: string | null | undefined): string {
    const baseName = String(originalName || 'contact-image')
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    return `${baseName || 'contact-image'}-cropped.png`;
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });
  }

  private prepareExistingProfileImageDraft(): void {
    if (!this.profileImageUrl) {
      return;
    }

    this.cropPreparing = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.profileImageModalOpen = true;

    fetch(this.profileImageUrl, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch current image');
        }

        return response.blob();
      })
      .then((blob) => {
        const fileType = blob.type || this.contact?.profile_image?.content_type || 'image/png';
        const fileName = this.profileImageFileName || 'contact-image.png';
        this.prepareProfileImageDraft(new File([blob], fileName, { type: fileType }));
      })
      .catch(() => {
        this.cropPreparing = false;
        this.profileImageError = 'Failed to load the current contact image for editing.';
      });
  }

  private handleCropDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.isCropDragging || !this.profileImageDraftUrl) {
      return;
    }

    if ('cancelable' in event && event.cancelable) {
      event.preventDefault();
    }

    const point = this.extractPoint(event);
    this.cropOffsetX = this.cropStartOffsetX + (point.x - this.cropDragStartX);
    this.cropOffsetY = this.cropStartOffsetY + (point.y - this.cropDragStartY);
    this.clampCropOffsets();
  }

  private clampCropOffsets(): void {
    const scaledWidth = this.cropImageWidth * this.cropZoom;
    const scaledHeight = this.cropImageHeight * this.cropZoom;
    const maxOffsetX = Math.max(0, (scaledWidth - this.cropViewportSize) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - this.cropViewportSize) / 2);

    this.cropOffsetX = this.clamp(this.cropOffsetX, -maxOffsetX, maxOffsetX);
    this.cropOffsetY = this.clamp(this.cropOffsetY, -maxOffsetY, maxOffsetY);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private extractPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
    if ('touches' in event && event.touches.length) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    if ('changedTouches' in event && event.changedTouches.length) {
      return {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY,
      };
    }

    return {
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    };
  }

  update(): void {
    if (!this.contactId) return;

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
      secondary_emails: (raw.secondary_emails || []).map((email: unknown) => String(email || '').trim()).filter(Boolean),
      secondary_phones: (raw.secondary_phones || []).map((phone: unknown) => String(phone || '').trim()).filter(Boolean),
      account_ids: raw.account_ids ?? [],
    };

    this.contactService.update(this.contactId, payload).subscribe({
      next: () => {
        this.saving = false;
        void this.router.navigate(['/contacts']);
      },
      error: (error: any) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to update contact.');
      },
    });
  }
}
