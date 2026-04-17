import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InvoiceAddComponent } from '../invoice/invoice-add/invoice-add.component';
import { InvoiceEditComponent } from '../invoice/invoice-edit/invoice-edit.component';
import { InvoiceListComponent } from '../invoice/invoice-list/invoice-list.component';
import { InvoiceSettingsComponent } from '../invoice/invoice-settings/invoice-settings.component';
import { InvoiceTemplateComponent } from '../invoice/invoice-template/invoice-template.component';
import { InvoiceViewComponent } from '../invoice/invoice-view/invoice-view.component';

const routes: Routes = [
  { path: '',  component: InvoiceListComponent, data: { title: 'Invoices' } },
  { path: '', children: [
                  { path: 'add', component: InvoiceAddComponent, data: { title: 'Add Invoice' } },
                  { path: 'templates', component: InvoiceTemplateComponent, data: { title: 'Invoice Templates' } },
                  { path: 'settings', component: InvoiceSettingsComponent, data: { title: 'Invoice Settings' } },
                  { path: 'edit/:id', component: InvoiceEditComponent, data: { title: 'Edit Invoice' } },
                  { path: 'view/:id',  component: InvoiceViewComponent,  data: { title: 'View Invoice' } },
                ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InvoiceRoutingModule {}
