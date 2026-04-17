import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';

import { InvitationAcceptComponent } from './invitation-accept.component';

describe('InvitationAcceptComponent', () => {
  let component: InvitationAcceptComponent;
  let fixture: ComponentFixture<InvitationAcceptComponent>;

  beforeEach(async () => {
    window.history.replaceState({}, '', '/accept-invitation?token=invite-token');

    await TestBed.configureTestingModule({
      imports: [InvitationAcceptComponent, HttpClientTestingModule, RouterTestingModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ token: 'invite-token' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationAcceptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should patch the invitation token and scrub it from the url', () => {
    expect(component.form.get('token')?.value).toBe('invite-token');
    expect(new URL(window.location.href).searchParams.has('token')).toBeFalse();
  });
});
