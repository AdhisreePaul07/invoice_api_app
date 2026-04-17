import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { switchMap } from 'rxjs';

import { AuthRedirectService } from '../../core/services/auth-redirect.service';
import { AuthService } from '../../core/services/auth.service';
import { extractApiError } from '../../core/utils/api-error.util';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);

  loading = false;
  error: string | null = null;
  submitted = false;
  showPassword = false;

  readonly form: FormGroup = this.fb.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(254),
        Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/),
      ],
    ],
    password: ['', [Validators.required]],
    remember_me: [false],
  });

  constructor(
    private auth: AuthService,
    private authRedirect: AuthRedirectService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    const prefilledEmail = String(this.route.snapshot.queryParamMap.get('email') || '').trim();
    if (prefilledEmail) {
      this.form.patchValue({ email: prefilledEmail });
    }
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

  isInvalid(controlName: 'email' | 'password'): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty || this.submitted);
  }

  onSubmit(): void {
    this.submitted = true;
    this.error = null;

    if (!this.form || this.form.invalid || this.loading) return;

    const payload = {
      email: String(this.form.value.email || '').trim().toLowerCase(),
      password: String(this.form.value.password || ''),
      remember_me: !!this.form.value.remember_me,
    };
    const requestedReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    this.loading = true;

    this.auth.login(payload).pipe(
      switchMap(() => this.authRedirect.resolveAuthenticatedUrl(requestedReturnUrl))
    ).subscribe({
      next: (redirectUrl) => {
        this.loading = false;
        void this.router.navigateByUrl(redirectUrl);
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Login failed. Please check your credentials.');
      },
    });
  }
}
