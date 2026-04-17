import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ReceiptListComponent } from './receipt-list/receipt-list.component';
import { ReceiptAddComponent } from './receipt-add/receipt-add.component';
import { ReceiptEditComponent } from './receipt-edit/receipt-edit.component';
import { ReceiptSettingsComponent } from './receipt-settings/receipt-settings.component';

const routes: Routes = [
  { path: '', component: ReceiptListComponent, data: { title: 'Receipts' } },
  {
    path: '',
    children: [
      { path: 'add', component: ReceiptAddComponent, data: { title: 'Add Receipt' } },
      { path: 'settings', component: ReceiptSettingsComponent, data: { title: 'Receipt Settings' } },
      { path: 'edit/:id', component: ReceiptEditComponent, data: { title: 'Edit Receipt' } },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReceiptRoutingModule {}
