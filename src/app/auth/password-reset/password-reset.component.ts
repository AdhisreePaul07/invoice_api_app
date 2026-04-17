import { Component, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { extractApiError } from '../../core/utils/api-error.util';

@Component({
  selector: 'app-password-reset',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './password-reset.component.html',
  styleUrls: ['./password-reset.component.scss'],
})
export class PasswordResetComponent {
  private readonly fb = inject(FormBuilder);

  @ViewChildren('otpDigitInput') private otpDigitInputs?: QueryList<ElementRef<HTMLInputElement>>;

  loading = false;
  otpLoading = false;
  verifyLoading = false;
  submitted = false;
  otpSent = false;
  otpVerified = false;
  verifiedEmail = '';
  showPassword = false;
  showConfirmPassword = false;
  error: string | null = null;
  success: string | null = null;
  readonly otpSlots = Array.from({ length: 6 }, (_, index) => index);
  otpDigits = this.otpSlots.map(() => '');

  readonly form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    otp_code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    new_password: ['', [Validators.required, Validators.minLength(8)]],
    confirm_password: ['', [Validators.required]],
  });

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    const prefilledEmail = String(this.route.snapshot.queryParamMap.get('email') || '').trim();
    if (prefilledEmail) {
      this.form.patchValue({ email: prefilledEmail });
    }
  }

  get currentStep(): 'request' | 'verify' | 'reset' {
    if (!this.otpSent) return 'request';
    if (!this.otpVerified) return 'verify';
    return 'reset';
  }

  get emailAddress(): string {
    return String(this.form.get('email')?.value || '').trim().toLowerCase();
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty || this.submitted);
  }

  get passwordsMatch(): boolean {
    return String(this.form.get('new_password')?.value || '') === String(this.form.get('confirm_password')?.value || '');
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onOtpInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');

    if (!digits) {
      this.otpDigits[index] = '';
      this.syncOtpCode();
      return;
    }

    const isBulkEntry = digits.length > 1;
    this.applyOtpDigits(digits, isBulkEntry ? 0 : index, isBulkEntry);
  }

  onOtpKeydown(index: number, event: KeyboardEvent): void {
    const lowerKey = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && lowerKey === 'v') {
      this.tryClipboardShortcutPaste();
      return;
    }

    if (event.shiftKey && event.key === 'Insert') {
      this.tryClipboardShortcutPaste();
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();

      if (this.otpDigits[index]) {
        this.otpDigits[index] = '';
        this.syncOtpCode();
        return;
      }

      if (index > 0) {
        this.otpDigits[index - 1] = '';
        this.syncOtpCode();
        this.focusOtpInput(index - 1);
      }

      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      this.otpDigits[index] = '';
      this.syncOtpCode();
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusOtpInput(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < this.otpSlots.length - 1) {
      event.preventDefault();
      this.focusOtpInput(index + 1);
      return;
    }

    if (event.key.length === 1 && !/\d/.test(event.key)) {
      event.preventDefault();
    }
  }

  onOtpPaste(event: ClipboardEvent): void {
    const pastedDigits = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, this.otpSlots.length) || '';
    if (!pastedDigits) return;

    event.preventDefault();
    this.applyOtpDigits(pastedDigits, 0, true);
  }

  handleCardSubmit(): void {
    if (this.currentStep === 'request') {
      this.sendOtp();
      return;
    }

    if (this.currentStep === 'verify') {
      this.verifyOtp();
      return;
    }

    this.onSubmit();
  }

  sendOtp(): void {
    this.error = null;
    this.success = null;

    this.form.get('email')?.markAsTouched();
    if (this.form.get('email')?.invalid || this.otpLoading) return;

    const email = String(this.form.get('email')?.value || '').trim().toLowerCase();
    this.otpLoading = true;

    this.auth.requestPasswordResetOtp({ email }).subscribe({
      next: () => {
        this.otpLoading = false;
        this.otpSent = true;
        this.otpVerified = false;
        this.verifiedEmail = '';
        this.showPassword = false;
        this.showConfirmPassword = false;
        this.resetOtpDigits();
        this.form.patchValue({
          otp_code: '',
          new_password: '',
          confirm_password: '',
        });
        this.resetControls(['otp_code', 'new_password', 'confirm_password']);
        this.queueOtpFocus();
        this.success = 'If the account exists, an OTP has been sent to the email address.';
      },
      error: (err) => {
        this.otpLoading = false;
        this.error = extractApiError(err, 'Failed to send password reset OTP.');
      },
    });
  }

  verifyOtp(): void {
    this.error = null;
    this.success = null;

    this.form.get('email')?.markAsTouched();
    this.form.get('otp_code')?.markAsTouched();

    if (this.form.get('email')?.invalid || this.form.get('otp_code')?.invalid || this.verifyLoading) return;

    const email = String(this.form.get('email')?.value || '').trim().toLowerCase();
    const otp_code = String(this.form.get('otp_code')?.value || '').trim();

    this.verifyLoading = true;

    this.auth.verifyPasswordResetOtp({ email, otp_code }).subscribe({
      next: () => {
        this.verifyLoading = false;
        this.otpSent = true;
        this.otpVerified = true;
        this.verifiedEmail = email;
        this.showPassword = false;
        this.showConfirmPassword = false;
        this.form.patchValue({
          new_password: '',
          confirm_password: '',
        });
        this.resetControls(['new_password', 'confirm_password']);
        this.success = 'OTP verified. You can now set a new password.';
      },
      error: (err) => {
        this.verifyLoading = false;
        this.error = extractApiError(err, 'OTP verification failed.');
      },
    });
  }

  useDifferentEmail(): void {
    this.error = null;
    this.success = null;
    this.submitted = false;
    this.otpSent = false;
    this.otpVerified = false;
    this.verifiedEmail = '';
    this.showPassword = false;
    this.showConfirmPassword = false;
    this.form.patchValue({
      otp_code: '',
      new_password: '',
      confirm_password: '',
    });
    this.resetOtpDigits();
    this.resetControls(['email', 'otp_code', 'new_password', 'confirm_password']);
  }

  onSubmit(): void {
    this.submitted = true;
    this.error = null;
    this.success = null;

    if (this.form.invalid || !this.passwordsMatch || this.loading) return;

    const email = String(this.form.get('email')?.value || '').trim().toLowerCase();
    if (!this.otpVerified || this.verifiedEmail !== email) {
      this.error = 'Verify the OTP for this email before setting a new password.';
      return;
    }

    this.loading = true;

    this.auth.confirmPasswordReset({
      email,
      new_password: String(this.form.get('new_password')?.value || ''),
    }).subscribe({
      next: () => {
        this.loading = false;
        void this.router.navigate(['/login'], {
          queryParams: { email },
        });
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to reset password.');
      },
    });
  }

  private resetControls(controlNames: string[]): void {
    controlNames.forEach((controlName) => {
      const control = this.form.get(controlName);
      control?.markAsPristine();
      control?.markAsUntouched();
      control?.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    });
  }

  private syncOtpCode(): void {
    const otpCode = this.otpDigits.join('');
    const control = this.form.get('otp_code');
    control?.setValue(otpCode, { emitEvent: false });
    control?.markAsTouched();
    control?.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }

  private resetOtpDigits(): void {
    this.otpDigits = this.otpSlots.map(() => '');
  }

  private applyOtpDigits(rawDigits: string, startIndex: number, resetFirst = false): void {
    const digits = rawDigits.replace(/\D/g, '').slice(0, this.otpSlots.length);
    if (!digits) return;

    if (resetFirst) {
      this.resetOtpDigits();
    }

    digits
      .slice(0, this.otpSlots.length - startIndex)
      .split('')
      .forEach((digit, offset) => {
        this.otpDigits[startIndex + offset] = digit;
      });

    this.syncOtpCode();

    const nextIndex = Math.min(startIndex + digits.length - 1, this.otpSlots.length - 1);
    this.focusOtpInput(nextIndex);
  }

  private tryClipboardShortcutPaste(): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;

    void navigator.clipboard
      .readText()
      .then((text) => {
        const digits = text.replace(/\D/g, '').slice(0, this.otpSlots.length);
        if (!digits) return;

        this.applyOtpDigits(digits, 0, true);
      })
      .catch(() => {
        // Let the normal paste/input flow handle browsers that block clipboard reads.
      });
  }

  private focusOtpInput(index: number): void {
    const target = this.otpDigitInputs?.get(index)?.nativeElement;
    if (!target) return;

    target.focus();
    target.select();
  }

  private queueOtpFocus(): void {
    if (typeof window === 'undefined') return;

    window.setTimeout(() => {
      this.focusOtpInput(0);
    });
  }
}
