import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class GstCalculatorService {
  private readonly openSubject = new BehaviorSubject<boolean>(false);

  readonly open$ = this.openSubject.asObservable();

  open(): void {
    this.openSubject.next(true);
  }

  close(): void {
    this.openSubject.next(false);
  }

  isOpen(): boolean {
    return this.openSubject.value;
  }
}
