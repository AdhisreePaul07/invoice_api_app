import { Component, ElementRef, OnDestroy, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { extractApiError } from '../../core/utils/api-error.util';

type RegistrationStep = 'details' | 'verify';

type StagedRegistration = {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  business_name: string;
  organization_name: string;
};

type PasswordRule = {
  label: string;
  met: boolean;
};

type PasswordRuleCheck = {
  label: string;
  test: (value: string) => boolean;
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);

  @ViewChildren('otpDigitInput') private otpDigitInputs?: QueryList<ElementRef<HTMLInputElement>>;

  loading = false;
  otpLoading = false;
  verifyLoading = false;
  submitted = false;
  showPassword = false;
  error: string | null = null;
  success: string | null = null;
  currentStep: RegistrationStep = 'details';
  resendCountdown = 0;
  readonly otpSlots = Array.from({ length: 6 }, (_, index) => index);
  otpDigits = this.otpSlots.map(() => '');
  private readonly resendCooldownSeconds = 30;
  private stagedRegistration: StagedRegistration | null = null;
  private resendTimerId: number | null = null;
  private passwordValueSubscription?: Subscription;
  private readonly detailControlNames = [
    'first_name',
    'last_name',
    'email',
    'business_name',
    'password',
  ] as const;
  private readonly passwordRuleChecks: PasswordRuleCheck[] = [
    { label: 'Lowercase (abc)', test: (value) => /[a-z]/.test(value) },
    { label: 'Uppercase (ABC)', test: (value) => /[A-Z]/.test(value) },
    { label: 'Numbers (123)', test: (value) => /\d/.test(value) },
    { label: 'Special characters (!#$@&*)', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
  ];

  passwordValue = '';
  readonly passwordRules: PasswordRule[] = this.passwordRuleChecks.map(({ label }) => ({ label, met: false }));
  passwordCriteriaMatched = 0;
  passwordStrengthPercent = 0;
  passwordStrengthBarClass = 'bg-secondary';
  passwordStrengthLabel = 'Start typing';

  readonly form: FormGroup = this.fb.group({
    first_name: ['', [Validators.required, Validators.minLength(2)]],
    last_name: ['', [Validators.required, Validators.minLength(1)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    business_name: ['', [Validators.required, Validators.minLength(2)]],
    otp_code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
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

    this.updatePasswordStrength(this.form.get('password')?.value);
    this.passwordValueSubscription = this.form
      .get('password')
      ?.valueChanges.subscribe((value) => this.updatePasswordStrength(value));
  }

  ngOnDestroy(): void {
    this.prepareAuthRouteChange();
    this.passwordValueSubscription?.unsubscribe();
    this.stopResendCountdown();
  }

  get emailAddress(): string {
    return this.stagedRegistration?.email || String(this.form.get('email')?.value || '').trim().toLowerCase();
  }

  get otpSubmitLabel(): string {
    if (this.loading) return 'Creating account...';
    return this.verifyLoading ? 'Verifying...' : 'Verify OTP';
  }

  get resendOtpLabel(): string {
    if (this.otpLoading) return 'Sending OTP...';
    if (this.resendCountdown > 0) return `Resend in ${this.resendCountdown}s`;
    return 'Resend OTP';
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty || this.submitted);
  }

  trackPasswordRule(_: number, rule: PasswordRule): string {
    return rule.label;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  prepareAuthRouteChange(): void {
    if (typeof document === 'undefined') return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
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

  sendOtp(): void {
    this.submitted = true;
    this.error = null;
    this.success = null;
    this.markControlsTouched(this.detailControlNames);

    if (this.hasInvalidControls(this.detailControlNames) || this.otpLoading || this.loading) {
      return;
    }

    const stagedRegistration = this.buildStagedRegistration();
    if (!stagedRegistration) {
      this.error = 'Enter valid registration details to continue.';
      return;
    }

    this.otpLoading = true;

    this.auth.requestRegistrationOtp({ email: stagedRegistration.email }).subscribe({
      next: () => {
        this.otpLoading = false;
        this.stagedRegistration = stagedRegistration;
        this.submitted = false;
        this.showPassword = false;
        this.resetOtpDigits();
        this.form.patchValue({ otp_code: '' });
        this.resetControls(['otp_code']);
        this.success = `OTP sent to ${stagedRegistration.email}. Enter the code to finish registration.`;
        this.currentStep = 'verify';
        this.startResendCountdown();
        this.queueOtpFocus();
      },
      error: (err) => {
        this.otpLoading = false;
        this.error = extractApiError(err, 'Failed to send registration OTP.');
      },
    });
  }

  verifyOtp(): void {
    this.error = null;
    this.success = null;
    this.submitted = true;
    this.form.get('otp_code')?.markAsTouched();

    if (this.form.get('otp_code')?.invalid || this.verifyLoading || this.loading) return;

    const stagedRegistration = this.stagedRegistration || this.buildStagedRegistration();
    if (!stagedRegistration) {
      this.error = 'Your registration details expired. Please start again.';
      this.currentStep = 'details';
      return;
    }

    const otp_code = String(this.form.get('otp_code')?.value || '').trim();

    this.verifyLoading = true;

    this.auth.verifyRegistrationOtp({ email: stagedRegistration.email, otp_code }).subscribe({
      next: () => {
        this.verifyLoading = false;
        this.success = 'OTP verified. Creating your account...';
        this.completeRegistration(stagedRegistration);
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
    this.loading = false;
    this.otpLoading = false;
    this.verifyLoading = false;
    this.stagedRegistration = null;
    this.showPassword = false;
    this.currentStep = 'details';
    this.stopResendCountdown();
    this.resendCountdown = 0;
    this.resetOtpDigits();
    this.form.patchValue({ otp_code: '' });
    this.resetControls(['otp_code']);
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

  private markControlsTouched(controlNames: readonly string[]): void {
    controlNames.forEach((controlName) => {
      this.form.get(controlName)?.markAsTouched();
    });
  }

  private hasInvalidControls(controlNames: readonly string[]): boolean {
    return controlNames.some((controlName) => this.form.get(controlName)?.invalid);
  }

  private buildStagedRegistration(): StagedRegistration | null {
    const first_name = String(this.form.get('first_name')?.value || '').trim();
    const last_name = String(this.form.get('last_name')?.value || '').trim();
    const email = String(this.form.get('email')?.value || '').trim().toLowerCase();
    const password = String(this.form.get('password')?.value || '');
    const business_name = String(this.form.get('business_name')?.value || '').trim();
    const organization_name = business_name;

    if (!first_name || !last_name || !email || !password || !organization_name) {
      return null;
    }

    return {
      email,
      first_name,
      last_name,
      password,
      business_name,
      organization_name,
    };
  }

  private updatePasswordStrength(rawValue: unknown): void {
    const value = String(rawValue || '');
    this.passwordValue = value;

    let matched = 0;
    this.passwordRuleChecks.forEach((rule, index) => {
      const met = rule.test(value);
      this.passwordRules[index].met = met;
      if (met) {
        matched += 1;
      }
    });

    this.passwordCriteriaMatched = matched;
    this.passwordStrengthPercent = matched * 25;
    this.passwordStrengthBarClass = this.getPasswordStrengthBarClass(matched);
    this.passwordStrengthLabel = this.getPasswordStrengthLabel(value, matched);
  }

  private getPasswordStrengthBarClass(matched: number): string {
    switch (matched) {
      case 1:
        return 'bg-danger';
      case 2:
        return 'bg-warning';
      case 3:
        return 'bg-info';
      case 4:
        return 'bg-success';
      default:
        return 'bg-secondary';
    }
  }

  private getPasswordStrengthLabel(value: string, matched: number): string {
    if (!value) {
      return 'Start typing';
    }

    switch (matched) {
      case 0:
      case 1:
        return 'Weak';
      case 2:
        return 'Fair';
      case 3:
        return 'Good';
      case 4:
        return 'Strong';
      default:
        return 'Weak';
    }
  }

  private completeRegistration(stagedRegistration: StagedRegistration): void {
    this.loading = true;

    this.auth
      .completeRegistration({
        email: stagedRegistration.email,
        first_name: stagedRegistration.first_name,
        last_name: stagedRegistration.last_name,
        password: stagedRegistration.password,
        organization_name: stagedRegistration.organization_name,
      })
      .subscribe({
        next: (response) => {
          this.loading = false;

          const organizationId = response.organization?.id;
          if (organizationId) {
            void this.router.navigate(['/organizations/edit', organizationId]);
            return;
          }

          void this.router.navigate(['/organizations/add']);
        },
        error: (err) => {
          this.loading = false;
          this.success = null;
          this.error = extractApiError(err, 'Registration failed.');
        },
      });
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

  private startResendCountdown(): void {
    this.stopResendCountdown();
    this.resendCountdown = this.resendCooldownSeconds;

    if (typeof window === 'undefined') return;

    this.resendTimerId = window.setInterval(() => {
      if (this.resendCountdown <= 1) {
        this.resendCountdown = 0;
        this.stopResendCountdown();
        return;
      }

      this.resendCountdown -= 1;
    }, 1000);
  }

  private stopResendCountdown(): void {
    if (this.resendTimerId === null || typeof window === 'undefined') return;

    window.clearInterval(this.resendTimerId);
    this.resendTimerId = null;
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
