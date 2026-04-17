import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ItemRoutingModule } from './item-routing.module';
import { ItemAddComponent } from '../item/item-add/item-add.component';
import { ItemEditComponent } from '../item/item-edit/item-edit.component';
import { ItemListComponent } from '../item/item-list/item-list.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ItemRoutingModule,
    ItemAddComponent,
    ItemEditComponent,
    ItemListComponent,
  ]
})
export class ItemModule { }
