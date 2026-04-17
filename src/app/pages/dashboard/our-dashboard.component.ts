import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Observable, firstValueFrom } from 'rxjs';

import { AccountService } from '../../core/services/account.service';
import { ContactService } from '../../core/services/contact.service';
import { DealService } from '../../core/services/deal.service';
import { InvoiceService } from '../../core/services/invoice.service';
import { ItemService } from '../../core/services/item.service';
import { OrganizationService } from '../../core/services/organization.service';
import { ReceiptService } from '../../core/services/receipt.service';
import { extractApiError } from '../../core/utils/api-error.util';

type StatusMeta = { value: number; label: string };
type StatusBucket = { label: string; count: number; ratio: number };
type MonthlyPoint = { label: string; amount: number; ratio: number };
type TopAccountRow = { name: string; invoiceCount: number; invoiceTotal: number };

@Component({
  selector: 'app-our-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './our-dashboard.component.html',
  styleUrls: ['./our-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OurDashboardComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly accountService = inject(AccountService);
  private readonly contactService = inject(ContactService);
  private readonly dealService = inject(DealService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly receiptService = inject(ReceiptService);
  private readonly itemService = inject(ItemService);
  private readonly organizationService = inject(OrganizationService);

  private readonly dealStatuses: ReadonlyArray<StatusMeta> = [
    { value: 0, label: 'Open' },
    { value: 1, label: 'In Progress' },
    { value: 2, label: 'Won' },
    { value: 3, label: 'Lost' },
  ];

  private readonly invoiceStatuses: ReadonlyArray<StatusMeta> = [
    { value: 0, label: 'Draft' },
    { value: 1, label: 'Sent' },
    { value: 2, label: 'Partial' },
    { value: 3, label: 'Paid' },
    { value: 4, label: 'Overdue' },
    { value: 5, label: 'Void' },
  ];

  loading = true;
  error: string | null = null;
  partialDataWarning: string | null = null;

  workspaceName = 'Workspace';
  updatedAt = new Date();

  totalAccounts = 0;
  totalContacts = 0;
  totalDeals = 0;
  totalInvoices = 0;
  totalReceipts = 0;
  totalItems = 0;

  pipelineValue = 0;
  wonValue = 0;
  billedAmount = 0;
  collectedAmount = 0;
  balanceDueAmount = 0;
  collectionRate = 0;
  winRate = 0;

  dealStatusBreakdown: StatusBucket[] = [];
  invoiceStatusBreakdown: StatusBucket[] = [];
  monthlyInvoiceSeries: MonthlyPoint[] = [];
  topAccountsByBilling: TopAccountRow[] = [];

  recentInvoices: any[] = [];
  recentReceipts: any[] = [];

  ngOnInit(): void {
    this.title.setTitle('Our Dashboard - Clienet');
    void this.loadDashboard();
  }

  async refresh(): Promise<void> {
    await this.loadDashboard();
  }

  invoiceStatusLabel(status: unknown): string {
    const value = Number(status);
    return this.invoiceStatuses.find((entry) => entry.value === value)?.label || '-';
  }

  receiptStatusLabel(status: unknown): string {
    switch (Number(status)) {
      case 0:
        return 'Completed';
      case 1:
        return 'Failed';
      case 2:
        return 'Cancelled';
      default:
        return '-';
    }
  }

  resolveInvoiceAccountName(invoice: any): string {
    return (
      String(invoice?.account_snapshot?.account_name || '').trim() ||
      String(invoice?.account_details?.[0]?.account_name || '').trim() ||
      (invoice?.account ? `Account #${invoice.account}` : '-')
    );
  }

  resolveReceiptInvoiceNo(receipt: any): string {
    return String(receipt?.invoice_snapshot?.invoice_no || '').trim() || '-';
  }

  resolveReceiptAccountName(receipt: any): string {
    return String(receipt?.invoice_snapshot?.account_name || '').trim() || '-';
  }

  formatAmount(value: unknown): string {
    const amount = this.toNumber(value);
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  trackByLabel = (_: number, row: { label: string }) => row.label;
  trackByName = (_: number, row: { name: string }) => row.name;
  trackById = (_: number, row: any) => Number(row?.id ?? 0);

  private async loadDashboard(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.partialDataWarning = null;

    const results = await Promise.allSettled([
      this.fetchAllPages((headers) => this.accountService.list(headers)),
      this.fetchAllPages((headers) => this.contactService.list(headers)),
      this.fetchAllPages((headers) => this.dealService.list(headers)),
      this.fetchAllPages((headers) => this.invoiceService.list(headers)),
      this.fetchAllPages((headers) => this.receiptService.list(headers)),
      this.fetchAllPages((headers) => this.itemService.list(headers)),
      firstValueFrom(this.organizationService.getCurrent()),
    ]);

    const rejected = results.filter((entry) => entry.status === 'rejected');
    if (rejected.length === results.length) {
      this.loading = false;
      this.error = extractApiError(
        (rejected[0] as PromiseRejectedResult).reason,
        'Unable to load dashboard data right now.'
      );
      return;
    }

    if (rejected.length > 0) {
      this.partialDataWarning = 'Some widgets could not be fully loaded right now. Showing available live data.';
    }

    const accounts = this.readSettledList(results[0]);
    const contacts = this.readSettledList(results[1]);
    const deals = this.readSettledList(results[2]);
    const invoices = this.readSettledList(results[3]);
    const receipts = this.readSettledList(results[4]);
    const items = this.readSettledList(results[5]);
    const organizationResponse = this.readSettledValue(results[6]);

    this.workspaceName = this.extractWorkspaceName(organizationResponse);
    this.updatedAt = new Date();

    this.totalAccounts = accounts.length;
    this.totalContacts = contacts.length;
    this.totalDeals = deals.length;
    this.totalInvoices = invoices.length;
    this.totalReceipts = receipts.length;
    this.totalItems = items.length;

    this.pipelineValue = deals
      .filter((deal) => [0, 1].includes(Number(deal?.deal_status)))
      .reduce((sum, deal) => sum + this.toNumber(deal?.deal_value), 0);
    this.wonValue = deals
      .filter((deal) => Number(deal?.deal_status) === 2)
      .reduce((sum, deal) => sum + this.toNumber(deal?.deal_value), 0);

    this.billedAmount = invoices
      .filter((invoice) => Number(invoice?.invoice_status) !== 5)
      .reduce((sum, invoice) => sum + this.toNumber(invoice?.total), 0);
    this.balanceDueAmount = invoices
      .filter((invoice) => Number(invoice?.invoice_status) !== 5)
      .reduce((sum, invoice) => sum + this.toNumber(invoice?.balance_due), 0);
    this.collectedAmount = receipts
      .filter((receipt) => Number(receipt?.receipt_status) === 0)
      .reduce((sum, receipt) => sum + this.toNumber(receipt?.amount_received), 0);

    this.collectionRate = this.billedAmount > 0 ? (this.collectedAmount / this.billedAmount) * 100 : 0;
    this.winRate = deals.length > 0 ? (deals.filter((deal) => Number(deal?.deal_status) === 2).length / deals.length) * 100 : 0;

    this.dealStatusBreakdown = this.buildStatusBuckets(deals, this.dealStatuses, (deal) => deal?.deal_status);
    this.invoiceStatusBreakdown = this.buildStatusBuckets(invoices, this.invoiceStatuses, (invoice) => invoice?.invoice_status);
    this.monthlyInvoiceSeries = this.buildMonthlyInvoiceSeries(invoices);
    this.topAccountsByBilling = this.buildTopAccounts(invoices);

    this.recentInvoices = this.sortByDate(
      invoices,
      (invoice) => invoice?.invoice_date || invoice?.created_at,
    ).slice(0, 6);
    this.recentReceipts = this.sortByDate(
      receipts,
      (receipt) => receipt?.receipt_date || receipt?.created_at,
    ).slice(0, 6);

    this.loading = false;
  }

  private readSettledList(result: PromiseSettledResult<any[]>): any[] {
    if (result.status !== 'fulfilled') return [];
    return Array.isArray(result.value) ? result.value : [];
  }

  private readSettledValue(result: PromiseSettledResult<unknown>): unknown {
    return result.status === 'fulfilled' ? result.value : null;
  }

  private async fetchAllPages(
    request: (headers: Record<string, string>) => Observable<any>,
  ): Promise<any[]> {
    const limit = 100;
    let page = 1;
    let totalPages = 1;
    const rows: any[] = [];

    do {
      const response = await firstValueFrom(
        request({
          'X-Limit': String(limit),
          'X-Page': String(page),
        }),
      );
      const currentRows = Array.isArray(response?.list) ? response.list : [];
      rows.push(...currentRows);
      totalPages = Math.max(1, Number(response?.total_pages ?? 1));
      page += 1;
    } while (page <= totalPages);

    return rows;
  }

  private buildStatusBuckets(
    rows: any[],
    statuses: ReadonlyArray<StatusMeta>,
    statusReader: (row: any) => unknown,
  ): StatusBucket[] {
    const total = rows.length;

    return statuses.map((status) => {
      const count = rows.filter((row) => Number(statusReader(row)) === status.value).length;
      const ratio = total > 0 ? (count / total) * 100 : 0;
      return {
        label: status.label,
        count,
        ratio,
      };
    });
  }

  private buildMonthlyInvoiceSeries(invoices: any[]): MonthlyPoint[] {
    const now = new Date();
    const monthFrames: Array<{ key: string; label: string }> = [];

    for (let step = 5; step >= 0; step -= 1) {
      const frameDate = new Date(now.getFullYear(), now.getMonth() - step, 1);
      const key = `${frameDate.getFullYear()}-${frameDate.getMonth() + 1}`;
      const label = frameDate.toLocaleDateString('en-IN', { month: 'short' });
      monthFrames.push({ key, label });
    }

    const totalsByMonth = new Map<string, number>();
    monthFrames.forEach((frame) => totalsByMonth.set(frame.key, 0));

    invoices.forEach((invoice) => {
      if (Number(invoice?.invoice_status) === 5) return;
      const date = this.toDate(invoice?.invoice_date || invoice?.created_at);
      if (!date) return;
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (!totalsByMonth.has(key)) return;
      totalsByMonth.set(key, (totalsByMonth.get(key) || 0) + this.toNumber(invoice?.total));
    });

    const points = monthFrames.map((frame) => ({
      label: frame.label,
      amount: totalsByMonth.get(frame.key) || 0,
      ratio: 0,
    }));
    const max = Math.max(...points.map((point) => point.amount), 0);

    return points.map((point) => ({
      ...point,
      ratio: max > 0 ? (point.amount / max) * 100 : 0,
    }));
  }

  private buildTopAccounts(invoices: any[]): TopAccountRow[] {
    const rows = new Map<string, TopAccountRow>();

    invoices.forEach((invoice) => {
      if (Number(invoice?.invoice_status) === 5) return;
      const name = this.resolveInvoiceAccountName(invoice);
      if (!name || name === '-') return;
      const current = rows.get(name) || { name, invoiceCount: 0, invoiceTotal: 0 };
      current.invoiceCount += 1;
      current.invoiceTotal += this.toNumber(invoice?.total);
      rows.set(name, current);
    });

    return Array.from(rows.values())
      .sort((a, b) => b.invoiceTotal - a.invoiceTotal || b.invoiceCount - a.invoiceCount)
      .slice(0, 5);
  }

  private sortByDate(rows: any[], dateReader: (row: any) => unknown): any[] {
    return [...rows].sort((a, b) => this.toTimestamp(dateReader(b)) - this.toTimestamp(dateReader(a)));
  }

  private toTimestamp(value: unknown): number {
    const date = this.toDate(value);
    return date ? date.getTime() : 0;
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private extractWorkspaceName(response: unknown): string {
    if (!response || typeof response !== 'object') {
      return 'Workspace';
    }

    const root = response as Record<string, unknown>;
    const organization =
      (root['organization'] as Record<string, unknown> | null | undefined) ||
      root;

    return (
      String(organization['org_name'] || '').trim() ||
      String(organization['business_name'] || '').trim() ||
      String(organization['workspace_name'] || '').trim() ||
      'Workspace'
    );
  }
}
