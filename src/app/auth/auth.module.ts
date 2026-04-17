import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AccountsRoutingModule } from './../pages/accounts/accounts-routing.module';
import { LoginComponent } from './login/login.component';
import { ProfileComponent } from '../pages/profile/profile.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AccountsRoutingModule,
    LoginComponent,
    ProfileComponent,
  ],
})
export class AccountModule {}
