import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent, RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            logout: jasmine.createSpy('logout'),
            currentAccount$: of(null),
          },
        },
        {
          provide: LayoutService,
          useValue: {
            sidebarOpen$: of(false),
            toggleSidebar: jasmine.createSpy('toggleSidebar'),
            toggleSidebarMini: jasmine.createSpy('toggleSidebarMini'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
