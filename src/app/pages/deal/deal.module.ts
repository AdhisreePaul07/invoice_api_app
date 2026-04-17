import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { DealRoutingModule } from './deal-routing.module';
import { DealAddComponent } from '../deal/deal-add/deal-add.component';
import { DealEditComponent } from '../deal/deal-edit/deal-edit.component';
import { DealListComponent } from '../deal/deal-list/deal-list.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DealRoutingModule,
    DealAddComponent,
    DealEditComponent,
    DealListComponent,
  ]
})
export class DealModule { }
