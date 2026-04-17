import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';

import { AccountProfile, UserSession } from '../../core/models/auth.model';
import { AuthService } from '../../core/services/auth.service';
import { extractApiError } from '../../core/utils/api-error.util';
import { ProfileOverviewCardComponent } from './profile-overview-card.component';

@Component({
  selector: 'app-profile-security',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ProfileOverviewCardComponent],
  templateUrl: './profile-security.component.html',
  styleUrls: ['./profile-security.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSecurityComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  account: AccountProfile | null = this.auth.getCurrentAccount();
  sessions: UserSession[] = [];
  loadingProfile = false;
  loadingSessions = false;
  savingPassword = false;
  loggingOutOthers = false;
  revokingSessionId: string | null = null;
  passwordError: string | null = null;
  passwordSuccess: string | null = null;
  sessionsError: string | null = null;
  sessionsSuccess: string | null = null;

  readonly form = this.fb.group(
    {
      old_password: ['', [Validators.required]],
      new_password: ['', [Validators.required, Validators.minLength(10)]],
      confirm_password: ['', [Validators.required]],
    },
    { validators: [ProfileSecurityComponent.passwordsMatchValidator] }
  );

  ngOnInit(): void {
    this.title.setTitle('Clienet');
    this.loadProfile();
    this.loadSessions();
  }

  loadProfile(): void {
    this.loadingProfile = true;

    this.auth.loadProfile().subscribe({
      next: (account) => {
        this.account = account;
        this.loadingProfile = false;
      },
      error: () => {
        this.loadingProfile = false;
      },
    });
  }

  loadSessions(): void {
    this.loadingSessions = true;
    this.sessionsError = null;

    this.auth.listSessions().subscribe({
      next: (response) => {
        this.sessions = response?.list ?? [];
        this.loadingSessions = false;
      },
      error: (error) => {
        this.loadingSessions = false;
        this.sessionsError = extractApiError(error, 'Failed to load active sessions.');
      },
    });
  }

  submitPasswordChange(): void {
    this.passwordError = null;
    this.passwordSuccess = null;
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const raw = this.form.getRawValue();
    this.savingPassword = true;

    this.auth
      .changePassword({
        old_password: String(raw.old_password || ''),
        new_password: String(raw.new_password || ''),
      })
      .subscribe({
        next: (response) => {
          this.savingPassword = false;
          this.passwordSuccess = `${response?.message || 'Password changed successfully.'} Redirecting to login...`;
          this.form.reset();
          setTimeout(() => this.auth.forceLogout(), 1200);
        },
        error: (error) => {
          this.savingPassword = false;
          this.passwordError = extractApiError(error, 'Failed to change password.');
        },
      });
  }

  logoutOtherSessions(): void {
    this.sessionsError = null;
    this.sessionsSuccess = null;
    this.loggingOutOthers = true;

    this.auth.logoutOtherSessions().subscribe({
      next: (response) => {
        this.loggingOutOthers = false;
        this.sessionsSuccess = response?.message || 'Other sessions logged out.';
        this.loadSessions();
      },
      error: (error) => {
        this.loggingOutOthers = false;
        this.sessionsError = extractApiError(error, 'Failed to log out other sessions.');
      },
    });
  }

  revokeSession(session: UserSession): void {
    if (!session?.id || session.is_current) {
      return;
    }

    this.sessionsError = null;
    this.sessionsSuccess = null;
    this.revokingSessionId = session.id;

    this.auth.revokeSession({ session_id: session.id }).subscribe({
      next: (response) => {
        this.revokingSessionId = null;
        this.sessionsSuccess = response?.message || 'Session revoked successfully.';
        this.loadSessions();
      },
      error: (error) => {
        this.revokingSessionId = null;
        this.sessionsError = extractApiError(error, 'Failed to revoke the session.');
      },
    });
  }

  get hasRevocableSessions(): boolean {
    return this.sessions.some((session) => !session.is_current);
  }

  isInvalid(controlName: 'old_password' | 'new_password' | 'confirm_password'): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  get confirmPasswordMismatch(): boolean {
    const control = this.form.get('confirm_password');
    return !!control && (control.touched || control.dirty) && this.form.hasError('passwordMismatch');
  }

  formatTimestamp(value: string | null | undefined): string {
    if (!value) {
      return 'Unavailable';
    }

    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      return 'Unavailable';
    }

    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  }

  trackBySessionId(_index: number, session: UserSession): string {
    return session.id;
  }

  private static passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = String(control.get('new_password')?.value || '');
    const confirmPassword = String(control.get('confirm_password')?.value || '');

    if (!newPassword || !confirmPassword || newPassword === confirmPassword) {
      return null;
    }

    return { passwordMismatch: true };
  }
}
