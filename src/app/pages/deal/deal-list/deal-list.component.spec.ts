import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DealListComponent } from './deal-list.component';

describe('DealListComponent', () => {
  let component: DealListComponent;
  let fixture: ComponentFixture<DealListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DealListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DealListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
