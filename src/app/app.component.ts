import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BusyButtonService } from './core/services/busy-button.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  constructor(private readonly busyButtonService: BusyButtonService) {}
}
