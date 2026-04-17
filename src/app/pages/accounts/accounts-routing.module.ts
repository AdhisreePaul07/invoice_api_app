import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AccountsAddComponent } from './accounts-add/accounts-add.component';
import { AccountsEditComponent } from './accounts-edit/accounts-edit.component';
import { AccountListComponent } from './accounts-list/accounts-list.component';

const routes: Routes = [
  {
    path: '',
    component: AccountListComponent,
  },

  {
    path: '',
    children: [
      { path: 'add',
        component: AccountsAddComponent 
      },
      { path: 'edit/:id',
        component: AccountsEditComponent 
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AccountsRoutingModule {}
