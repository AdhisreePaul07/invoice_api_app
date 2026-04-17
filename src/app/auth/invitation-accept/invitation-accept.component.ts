import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { switchMap } from 'rxjs';

import { AuthRedirectService } from '../../core/services/auth-redirect.service';
import { AuthService } from '../../core/services/auth.service';
import { extractApiError } from '../../core/utils/api-error.util';

@Component({
  selector: 'app-invitation-accept',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './invitation-accept.component.html',
  styleUrls: ['../auth-shell.scss'],
})
export class InvitationAcceptComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  loading = false;
  submitted = false;
  showPassword = false;
  showConfirmPassword = false;
  error: string | null = null;

  readonly form: FormGroup = this.fb.group({
    token: ['', [Validators.required]],
    first_name: ['', [Validators.required, Validators.minLength(2)]],
    last_name: [''],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm_password: ['', [Validators.required]],
  });

  constructor(
    private auth: AuthService,
    private authRedirect: AuthRedirectService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const token = String(this.route.snapshot.queryParamMap.get('token') || '').trim();
    if (token) {
      this.form.patchValue({ token });
      this.scrubTokenFromUrl();
    }
  }

  isInvalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.touched || control.dirty || this.submitted);
  }

  get passwordsMatch(): boolean {
    return String(this.form.get('password')?.value || '') === String(this.form.get('confirm_password')?.value || '');
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  private scrubTokenFromUrl(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const nextUrl = new URL(window.location.href);
    if (!nextUrl.searchParams.has('token')) {
      return;
    }

    nextUrl.searchParams.delete('token');
    window.history.replaceState(window.history.state, document.title, nextUrl.toString());
  }

  onSubmit(): void {
    this.submitted = true;
    this.error = null;

    if (this.form.invalid || !this.passwordsMatch || this.loading) return;

    this.loading = true;

    this.auth.acceptInvitation({
      token: String(this.form.get('token')?.value || '').trim(),
      first_name: String(this.form.get('first_name')?.value || '').trim(),
      last_name: String(this.form.get('last_name')?.value || '').trim(),
      password: String(this.form.get('password')?.value || ''),
    }).pipe(
      switchMap(() => this.authRedirect.resolveAuthenticatedUrl())
    ).subscribe({
      next: (redirectUrl) => {
        this.loading = false;
        void this.router.navigateByUrl(redirectUrl);
      },
      error: (err) => {
        this.loading = false;
        this.error = extractApiError(err, 'Failed to accept invitation.');
      },
    });
  }
}
