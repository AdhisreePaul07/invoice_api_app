import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AccountsRoutingModule } from './accounts-routing.module';
import { AccountsAddComponent } from './accounts-add/accounts-add.component';
import { AccountsEditComponent } from './accounts-edit/accounts-edit.component';
import { AccountListComponent } from './accounts-list/accounts-list.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AccountsRoutingModule,
    AccountsAddComponent,
    AccountsEditComponent,
    AccountListComponent,
  ]
})
export class AccountsModule { }
