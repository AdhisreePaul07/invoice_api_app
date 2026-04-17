import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { AccountProfile } from '../../core/models/auth.model';
import { Organization } from '../../core/models/organization.model';
import { resolveImageUrl } from '../../core/utils/image-upload.util';

@Component({
  selector: 'app-profile-overview-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-overview-card.component.html',
  styleUrls: ['./profile-overview-card.component.scss'],
})
export class ProfileOverviewCardComponent {
  @Input() account: AccountProfile | null = null;
  @Input() organization: Organization | null = null;
  @Input() loading = false;
  @Input() editableAvatar = false;
  @Input() avatarActionBusy = false;

  @Output() avatarActionRequested = new EventEmitter<void>();

  get displayName(): string {
    const firstName = String(this.account?.first_name || '').trim();
    const lastName = String(this.account?.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || this.account?.email || 'Workspace User';
  }

  get headerTitle(): string {
    return this.organization?.org_name || this.displayName;
  }

  get ownerName(): string {
    return this.displayName;
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

  get workspaceLabel(): string {
    return this.organization?.org_name || this.account?.tenant?.org_name || 'No workspace assigned';
  }

  get emailVerificationLabel(): string {
    return this.account?.is_email_verified ? 'Verified' : 'Pending verification';
  }

  get avatarUrl(): string {
    return (
      resolveImageUrl(this.organization?.profile_image?.url) ||
      resolveImageUrl(this.organization?.company_logo?.url) ||
      resolveImageUrl(this.account?.profile_image?.url) ||
      '/assets/images/avatar/avatar5.webp'
    );
  }

  onAvatarAction(): void {
    this.avatarActionRequested.emit();
  }
}
