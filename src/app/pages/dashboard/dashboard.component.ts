import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { Title } from '@angular/platform-browser';

import { PageAssetService } from '../../core/services/page-asset.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, AfterViewInit {
  private readonly title = inject(Title);
  private readonly pageAssets = inject(PageAssetService);

  private readonly pageScripts = [
    '/assets/libs/jquery/jquery.min.js',
    '/assets/libs/simplebar/simplebar.min.js',
    '/assets/libs/sortable/Sortable.min.js',
    '/assets/libs/chartjs/chart.js',
    '/assets/libs/flatpickr/flatpickr.min.js',
    '/assets/libs/apexcharts/apexcharts.min.js',
    '/assets/libs/datatables/datatables.min.js',
    '/assets/js/dashboard/dashboard.js',
    '/assets/js/plugins/todolist.js',
  ] as const;

  ngOnInit(): void {
    this.title.setTitle('Clienet');
  }

  async ngAfterViewInit(): Promise<void> {
    await this.pageAssets.applyPageAssets({
      htmlAttributes: {
        lang: 'en',
      },
      scripts: [...this.pageScripts],
    });
  }
}
