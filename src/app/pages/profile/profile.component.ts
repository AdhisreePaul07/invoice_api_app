import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnInit, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { AccountProfile } from '../../core/models/auth.model';
import { AuthService } from '../../core/services/auth.service';
import { extractApiError } from '../../core/utils/api-error.util';
import { formatFileSize, formatImageAssetMeta, imageUrl, validateImageFile } from '../../core/utils/image-upload.util';
import { ProfileOverviewCardComponent } from './profile-overview-card.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ProfileOverviewCardComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly cropViewportSize = 320;
  private readonly cropMaxZoom = 3;
  private readonly title = inject(Title);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  account: AccountProfile | null = this.auth.getCurrentAccount();
  loading = false;
  error: string | null = null;
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

  ngOnInit(): void {
    this.title.setTitle('Clienet');
    this.loadProfile();
  }

  loadProfile(): void {
    this.loading = true;
    this.error = null;

    this.auth.loadProfile().subscribe({
      next: (account) => {
        this.account = account;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load your personal information.');
        this.cdr.markForCheck();
      },
    });
  }

  get roleLabel(): string {
    switch (String(this.account?.tenant_role || '')) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      case 'manager':
        return 'Manager';
      case 'viewer':
        return 'Viewer';
      default:
        return 'Member';
    }
  }

  get workspaceName(): string {
    return this.account?.tenant?.org_name || 'No workspace assigned';
  }

  get emailStatusLabel(): string {
    return this.account?.is_email_verified ? 'Verified' : 'Pending verification';
  }

  get accountStatusLabel(): string {
    return this.account?.is_active ? 'Active' : 'Inactive';
  }

  get profileImageUrl(): string {
    return imageUrl(this.account?.profile_image);
  }

  get profileImageFileName(): string {
    return String(this.account?.profile_image?.original_name || '').trim();
  }

  get profileImageMeta(): string {
    return formatImageAssetMeta(this.account?.profile_image);
  }

  get activeProfileImageFileName(): string {
    return this.selectedProfileImageFile?.name || this.profileImageFileName || 'No photo uploaded yet';
  }

  get activeProfileImageMeta(): string {
    if (this.selectedProfileImageFile) {
      const extension = String(this.selectedProfileImageFile.name || '').split('.').pop()?.toUpperCase() || '';
      return [formatFileSize(this.selectedProfileImageFile.size), extension].filter(Boolean).join(' • ');
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

  get profileModalTitle(): string {
    return this.isCropDraftActive ? 'Edit image' : 'Profile photo';
  }

  openProfileImageModal(): void {
    this.profileImageModalOpen = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;
    this.cdr.markForCheck();
  }

  closeProfileImageModal(): void {
    this.profileImageModalOpen = false;
    this.cancelCropDraft();
    this.cdr.markForCheck();
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
      this.cdr.markForCheck();
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
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      };
      image.onerror = () => {
        this.cropPreparing = false;
        this.profileImageError = 'Failed to load the selected image.';
        this.cdr.markForCheck();
      };
      image.src = result;
    };
    reader.onerror = () => {
      this.cropPreparing = false;
      this.profileImageError = 'Failed to read the selected image.';
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  handleCropAction(): void {
    if (this.isCropDraftActive) {
      this.profileImageError = null;
      this.profileImageSuccess = null;
      this.cdr.markForCheck();
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
        this.profileImageUploading = true;
        this.cropSaving = false;
        this.auth.uploadProfileImage(croppedFile).subscribe({
          next: (response) => {
            this.account = response?.user || this.auth.getCurrentAccount();
            this.profileImageUploading = false;
            this.profileImageSuccess = response?.message || 'Profile image updated successfully.';
            this.cancelCropDraft();
            this.profileImageModalOpen = true;
            this.cdr.markForCheck();
          },
          error: (error) => {
            this.profileImageUploading = false;
            this.profileImageError = extractApiError(error, 'Failed to update your profile image.');
            this.profileImageModalOpen = true;
            this.cdr.markForCheck();
          },
        });
      })
      .catch(() => {
        this.cropSaving = false;
        this.profileImageError = 'Failed to crop the selected image.';
        this.cdr.markForCheck();
      });
  }

  onCropZoomChange(value: string): void {
    const numericValue = Number(value);
    this.cropZoom = Number.isFinite(numericValue) ? Math.max(this.cropMinZoom, Math.min(this.cropMaxZoom, numericValue)) : 1;
    this.clampCropOffsets();
    this.cdr.markForCheck();
  }

  onCropWheel(event: WheelEvent): void {
    if (!this.profileImageDraftUrl) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    this.cropZoom = Math.max(this.cropMinZoom, Math.min(this.cropMaxZoom, this.cropZoom + delta));
    this.clampCropOffsets();
    this.cdr.markForCheck();
  }

  onStraightenChange(value: string): void {
    const numericValue = Number(value);
    this.straighten = Number.isFinite(numericValue) ? this.clamp(numericValue, -15, 15) : 0;
    this.cdr.markForCheck();
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
    this.cdr.markForCheck();
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
    this.cdr.markForCheck();
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

  removeProfileImage(): void {
    if (!this.profileImageUrl && !this.profileImageDraftUrl) {
      return;
    }

    if (this.profileImageDraftUrl) {
      this.cancelCropDraft();
      this.cdr.markForCheck();
      return;
    }

    this.profileImageRemoving = true;
    this.profileImageError = null;
    this.profileImageSuccess = null;

    this.auth.deleteProfileImage().subscribe({
      next: (response) => {
        this.account = response?.user || this.auth.getCurrentAccount();
        this.profileImageRemoving = false;
        this.profileImageSuccess = response?.message || 'Profile image removed successfully.';
        this.profileImageModalOpen = true;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.profileImageRemoving = false;
        this.profileImageError = extractApiError(error, 'Failed to remove your profile image.');
        this.profileImageModalOpen = true;
        this.cdr.markForCheck();
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
    const baseName = String(originalName || 'profile-image')
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
    return `${baseName || 'profile-image'}-cropped.png`;
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
    this.cdr.markForCheck();

    fetch(this.profileImageUrl, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch current image');
        }

        return response.blob();
      })
      .then((blob) => {
        const fileType = blob.type || this.account?.profile_image?.content_type || 'image/png';
        const fileName = this.profileImageFileName || 'profile-image.png';
        this.prepareProfileImageDraft(new File([blob], fileName, { type: fileType }));
      })
      .catch(() => {
        this.cropPreparing = false;
        this.profileImageError = 'Failed to load the current profile photo for cropping.';
        this.cdr.markForCheck();
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
    this.cdr.markForCheck();
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
}
