import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { GstCalculatorService } from '../../../core/services/gst-calculator.service';

type GstMode = 'exclusive' | 'inclusive';
type GstSupplyType = 'intra' | 'inter';

@Component({
  selector: 'app-gst-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gst-calculator.component.html',
  styleUrls: ['./gst-calculator.component.scss'],
})
export class GstCalculatorComponent {
  readonly commonRates = [0, 3, 5, 12, 18, 28];
  readonly open$;

  amount = 0;
  gstRate = 18;
  mode: GstMode = 'exclusive';
  supplyType: GstSupplyType = 'intra';

  constructor(private readonly gstCalculator: GstCalculatorService) {
    this.open$ = this.gstCalculator.open$;
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.gstCalculator.isOpen()) {
      this.close();
    }
  }

  close(): void {
    this.gstCalculator.close();
  }

  reset(): void {
    this.amount = 0;
    this.gstRate = 18;
    this.mode = 'exclusive';
    this.supplyType = 'intra';
  }

  get safeAmount(): number {
    const numericAmount = Number(this.amount);
    return Number.isFinite(numericAmount) && numericAmount >= 0 ? numericAmount : 0;
  }

  get taxableValue(): number {
    if (this.mode === 'inclusive') {
      const divisor = 1 + this.gstRate / 100;
      return divisor > 0 ? this.safeAmount / divisor : this.safeAmount;
    }

    return this.safeAmount;
  }

  get totalTax(): number {
    if (this.mode === 'inclusive') {
      return this.safeAmount - this.taxableValue;
    }

    return this.taxableValue * (this.gstRate / 100);
  }

  get grossAmount(): number {
    if (this.mode === 'inclusive') {
      return this.safeAmount;
    }

    return this.taxableValue + this.totalTax;
  }

  get typeLabel(): string {
    return this.supplyType === 'inter' ? 'Inter-state' : 'Intra-state';
  }

  get primaryTaxLabel(): string {
    return this.supplyType === 'inter' ? 'IGST' : 'CGST';
  }

  get cgst(): number {
    return this.supplyType === 'intra' ? this.totalTax / 2 : 0;
  }

  get sgst(): number {
    return this.supplyType === 'intra' ? this.totalTax / 2 : 0;
  }

  get igst(): number {
    return this.supplyType === 'inter' ? this.totalTax : 0;
  }
}
