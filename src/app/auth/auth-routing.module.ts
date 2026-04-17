// src/app/account/account-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { ProfileComponent } from '../pages/profile/profile.component';
import { AuthGuard } from '../core/gurds/auth.guard';
import { GuestGuard } from '../core/gurds/guest.guard';

const routes: Routes = [
  // /login → only when NOT logged in
  {
    path: 'login',
    canActivate: [GuestGuard],
    component: LoginComponent,
  },

  // /profile, /organizations → only when logged in
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: 'profile',
        component: ProfileComponent 
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AccountRoutingModule {}
