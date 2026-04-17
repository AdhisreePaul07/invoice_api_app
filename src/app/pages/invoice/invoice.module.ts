import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { InvoiceRoutingModule } from './invoice-routing.module';
import { InvoiceAddComponent } from '../invoice/invoice-add/invoice-add.component';
import { InvoiceEditComponent } from '../invoice/invoice-edit/invoice-edit.component';
import { InvoiceListComponent } from '../invoice/invoice-list/invoice-list.component';
import { InvoiceSettingsComponent } from '../invoice/invoice-settings/invoice-settings.component';
import { InvoiceTemplateComponent } from '../invoice/invoice-template/invoice-template.component';
import { InvoiceViewComponent } from '../invoice/invoice-view/invoice-view.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InvoiceRoutingModule,
    InvoiceAddComponent,
    InvoiceEditComponent,
    InvoiceListComponent,
    InvoiceSettingsComponent,
    InvoiceTemplateComponent,
    InvoiceViewComponent,
  ]
})
export class InvoiceModule { }
