import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ItemAddComponent } from '../item/item-add/item-add.component';
import { ItemEditComponent } from '../item/item-edit/item-edit.component';
import { ItemListComponent } from '../item/item-list/item-list.component';

const routes: Routes = [
  {
    path: '',
    component: ItemListComponent,
  },

  {
    path: '',
    children: [
      { path: 'add',
        component: ItemAddComponent 
      },
      { path: 'edit/:id',
        component: ItemEditComponent 
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ItemRoutingModule {}
