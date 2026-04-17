import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DealAddComponent } from '../deal/deal-add/deal-add.component';
import { DealEditComponent } from '../deal/deal-edit/deal-edit.component';
import { DealListComponent } from '../deal/deal-list/deal-list.component';

const routes: Routes = [
  { path: '', component: DealListComponent,},
  {
    path: '',
    children: [
      { path: 'add', component: DealAddComponent, data: { title: 'Add Deal' } },
      { path: 'edit/:id', component: DealEditComponent, data: { title: 'Edit Deal' }  },
    ],
  },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class DealRoutingModule { }
