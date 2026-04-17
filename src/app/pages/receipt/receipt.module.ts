import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ReceiptRoutingModule } from './receipt-routing.module';

import { ReceiptListComponent } from './receipt-list/receipt-list.component';
import { ReceiptAddComponent } from './receipt-add/receipt-add.component';
import { ReceiptEditComponent } from './receipt-edit/receipt-edit.component';
import { ReceiptSettingsComponent } from './receipt-settings/receipt-settings.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ReceiptRoutingModule,

    ReceiptListComponent,
    ReceiptAddComponent,
    ReceiptEditComponent,
    ReceiptSettingsComponent,
  ],
})
export class ReceiptModule {}
