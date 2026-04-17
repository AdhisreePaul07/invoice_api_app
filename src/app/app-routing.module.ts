import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GuestGuard } from './core/guards/guest.guard';

const routes: Routes = [
  {
    path: 'login',
    canActivate: [GuestGuard],
    loadComponent: () =>
      import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [GuestGuard],
    loadComponent: () =>
      import('./auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'reset-password',
    canActivate: [GuestGuard],
    loadComponent: () =>
      import('./auth/password-reset/password-reset.component').then((m) => m.PasswordResetComponent),
  },
  {
    path: 'accept-invitation',
    loadComponent: () =>
      import('./auth/invitation-accept/invitation-accept.component').then((m) => m.InvitationAcceptComponent),
  },

  {
    path: '',
    loadChildren: () =>
      import('./pages/pages.module').then((m) => m.PagesModule),
  },

  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
