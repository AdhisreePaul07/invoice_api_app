import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-image-upload-field',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-upload-field.component.html',
  styleUrls: ['./image-upload-field.component.scss'],
})
export class ImageUploadFieldComponent {
  @Input() label = 'Image';
  @Input() hint = '';
  @Input() previewUrl = '';
  @Input() fileName = '';
  @Input() meta = '';
  @Input() initialsSource = '';
  @Input() compactLayout = false;
  @Input() emptyLabel = 'No image uploaded yet.';
  @Input() emptyHint = 'PNG, JPG, WEBP, or SVG up to 5MB.';
  @Input() previewAlt = 'Uploaded image preview';
  @Input() uploading = false;
  @Input() removing = false;
  @Input() disabled = false;
  @Input() allowRemove = false;
  @Input() error: string | null = null;
  @Input() success: string | null = null;
  @Input() accept = '.png,.jpg,.jpeg,.webp,.svg';
  @Input() replaceLabel = 'Replace Image';
  @Input() uploadLabel = 'Upload Image';
  @Input() removeLabel = 'Remove';

  @Output() fileSelected = new EventEmitter<File>();
  @Output() removeRequested = new EventEmitter<void>();

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0);
    if (file) {
      this.fileSelected.emit(file);
    }

    if (input) {
      input.value = '';
    }
  }

  onRemove(): void {
    this.removeRequested.emit();
  }

  get placeholderInitials(): string {
    const source = String(this.initialsSource || this.label || 'Image').trim();
    if (!source) {
      return 'I';
    }

    const tokens = source
      .split(/[\s_-]+/)
      .map((token) => token.trim())
      .filter(Boolean);

    if (!tokens.length) {
      return source.slice(0, 1).toUpperCase();
    }

    if (tokens.length === 1) {
      return tokens[0].slice(0, 2).toUpperCase();
    }

    return `${tokens[0].slice(0, 1)}${tokens[1].slice(0, 1)}`.toUpperCase();
  }
}
