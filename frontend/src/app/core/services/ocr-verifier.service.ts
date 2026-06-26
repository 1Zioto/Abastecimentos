import { Injectable } from '@angular/core';

export type OcrImageKind = 'odometro' | 'bomba';

export interface OcrExpectedValues {
  odometro?: number | null;
  quantidadeLitros?: number | null;
  valorPorLitro?: number | null;
  valorTotal?: number | null;
}

export interface OcrCheck {
  field: string;
  expected?: number | null;
  found?: number | null;
  message: string;
  severity: 'info' | 'warning';
}

export interface OcrVerificationResult {
  kind: OcrImageKind;
  text: string;
  numbers: number[];
  checks: OcrCheck[];
}

@Injectable({ providedIn: 'root' })
export class OcrVerifierService {
  async verifyImage(file: File, kind: OcrImageKind, expected: OcrExpectedValues): Promise<OcrVerificationResult> {
    const tesseract = await import('tesseract.js');
    const result = await tesseract.recognize(file, 'por+eng');
    const text = result.data.text ?? '';
    const numbers = this.extractNumbers(text);
    const checks = kind === 'odometro'
      ? this.checkOdometro(text, numbers, expected)
      : this.checkBomba(text, numbers, expected);

    return { kind, text, numbers, checks };
  }

  private checkOdometro(text: string, numbers: number[], expected: OcrExpectedValues): OcrCheck[] {
    const expectedOdometro = this.asNumber(expected.odometro);
    if (expectedOdometro === null) {
      return [{
        field: 'odometro',
        expected: null,
        found: null,
        severity: 'info',
        message: 'OCR lido, mas o campo odômetro ainda não foi informado.',
      }];
    }

    const candidate = this.extractLabeledNumber(text, ['odometro', 'hodometro', 'hodômetro', 'km'], expectedOdometro)
      ?? this.bestOdometerCandidate(numbers, expectedOdometro);
    if (candidate === null) {
      return [{
        field: 'odometro',
        expected: expectedOdometro,
        found: null,
        severity: 'warning',
        message: 'Não encontrei um número de odômetro claro na foto.',
      }];
    }

    const tolerance = Math.max(2, Math.round(expectedOdometro * 0.001));
    if (Math.abs(candidate - expectedOdometro) <= tolerance) {
      return [{
        field: 'odometro',
        expected: expectedOdometro,
        found: candidate,
        severity: 'info',
        message: `Odômetro compatível com o lançamento: ${this.formatNumber(candidate, 0)} km.`,
      }];
    }

    return [{
      field: 'odometro',
      expected: expectedOdometro,
      found: candidate,
      severity: 'warning',
      message: `Possível divergência no odômetro: lançado ${this.formatNumber(expectedOdometro, 0)} km, OCR leu ${this.formatNumber(candidate, 0)} km.`,
    }];
  }

  private checkBomba(text: string, numbers: number[], expected: OcrExpectedValues): OcrCheck[] {
    const checks: OcrCheck[] = [];
    const litros = this.asNumber(expected.quantidadeLitros);
    const valorLitro = this.asNumber(expected.valorPorLitro);
    const total = this.asNumber(expected.valorTotal);
    const receiptLike = this.isReceiptLike(text);
    const physicalPumpLike = !receiptLike || this.isPhysicalPumpLike(text);
    const unitPriceLabels = ['valor por litro', 'preco por litro', 'preço por litro', 'r$/l', 'unitario', 'unitário'];
    const totalLabels = ['valor total', 'total', 'r$'];

    if (numbers.length === 0) {
      return [{
        field: 'bomba',
        expected: null,
        found: null,
        severity: 'warning',
        message: 'Imagem sem números legíveis. Anexe uma foto da bomba ou recibo/papel com os litros visíveis.',
      }];
    }

    if (litros !== null) {
      checks.push(this.checkClosestValue(
        'quantidade_litros',
        'litros',
        litros,
        this.withImplicitDecimalCandidates(
          this.candidatesForField(text, numbers, ['quantidade', 'qtd', 'qtde', 'litro', 'litros', 'volume'], litros),
          litros,
        ),
        Math.max(0.5, litros * 0.01),
        2,
      ));
    }

    if (physicalPumpLike && !receiptLike) {
      checks.push({
        field: 'tipo_imagem',
        expected: null,
        found: null,
        severity: 'info',
        message: 'Imagem tratada como bomba física; o OCR compara os litros e ignora preço/total quando não aparecem no visor.',
      });
    }

    if (valorLitro !== null && this.hasAnyLabel(text, unitPriceLabels)) {
      checks.push(this.checkClosestValue(
        'valor_por_litro',
        'valor por litro',
        valorLitro,
        this.candidatesForField(text, numbers, unitPriceLabels, valorLitro),
        0.08,
        3,
      ));
    }

    if (total !== null && (receiptLike || this.hasAnyLabel(text, totalLabels))) {
      if (!physicalPumpLike || receiptLike) {
        checks.push(this.checkClosestValue(
          'valor_total',
          'valor total',
          total,
          this.candidatesForField(text, numbers, totalLabels, total),
          Math.max(1, total * 0.015),
          2,
        ));
      }
    }

    if (checks.length === 0) {
      checks.push({
        field: 'bomba',
        expected: null,
        found: null,
        severity: 'info',
        message: 'OCR lido, mas ainda faltam litros/valores para comparar.',
      });
    }

    return checks;
  }

  private checkClosestValue(field: string, label: string, expected: number, numbers: number[], tolerance: number, digits: number): OcrCheck {
    const found = this.closest(numbers, expected);
    if (found === null) {
      return {
        field,
        expected,
        found: null,
        severity: 'warning',
        message: `Não encontrei ${label} claro na imagem. Anexe uma foto da bomba ou recibo/papel com essa informação visível.`,
      };
    }

    if (Math.abs(found - expected) <= tolerance) {
      return {
        field,
        expected,
        found,
        severity: 'info',
        message: `${this.capitalize(label)} compatível: ${this.formatNumber(found, digits)}.`,
      };
    }

    return {
      field,
      expected,
      found,
      severity: 'warning',
      message: `Possível divergência em ${label}: lançado ${this.formatNumber(expected, digits)}, OCR leu ${this.formatNumber(found, digits)}.`,
    };
  }

  private extractNumbers(text: string): number[] {
    const normalized = text
      .replace(/[Oo]/g, '0')
      .replace(/[Il]/g, '1')
      .replace(/\s+/g, ' ');

    const matches = normalized.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
    return matches
      .map((raw) => this.parseNumber(raw))
      .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  }

  private candidatesForField(text: string, allNumbers: number[], labels: string[], expected: number): number[] {
    const labeled = this.extractLabeledNumber(text, labels, expected);
    if (labeled !== null) return [labeled];
    return allNumbers.length <= 6 ? allNumbers : [];
  }

  private extractLabeledNumber(text: string, labels: string[], expected: number): number | null {
    const lines = text.split(/\r?\n/);
    const normalizedLabels = labels.map((label) => this.normalizeLabel(label));
    const candidates: number[] = [];

    lines.forEach((line, index) => {
      const normalizedLine = this.normalizeLabel(line);
      if (!normalizedLabels.some((label) => normalizedLine.includes(label))) return;
      const window = [
        index > 0 ? lines[index - 1] : '',
        line,
        index + 1 < lines.length ? lines[index + 1] : '',
      ].join(' ');
      candidates.push(...this.extractNumbers(window));
    });

    return this.closest(candidates, expected);
  }

  private parseNumber(raw: string): number | null {
    const clean = raw.replace(/[^\d.,]/g, '');
    if (!clean) return null;

    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    const decimalIndex = Math.max(lastComma, lastDot);
    let normalized = clean;

    if (decimalIndex >= 0) {
      const integerPart = clean.slice(0, decimalIndex).replace(/[.,]/g, '');
      const decimalPart = clean.slice(decimalIndex + 1).replace(/[.,]/g, '');
      normalized = `${integerPart}.${decimalPart}`;
    }

    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  private bestOdometerCandidate(numbers: number[], expected: number): number | null {
    const candidates = numbers
      .filter((n) => n >= 1000)
      .map((n) => Math.round(n));
    return this.closest(candidates, expected);
  }

  private closest(numbers: number[], expected: number): number | null {
    if (!numbers.length) return null;
    return numbers.reduce((best, current) => (
      Math.abs(current - expected) < Math.abs(best - expected) ? current : best
    ), numbers[0]);
  }

  private withImplicitDecimalCandidates(numbers: number[], expected: number): number[] {
    const candidates = new Set<number>();
    numbers.forEach((value) => {
      candidates.add(value);
      if (value >= 100) {
        candidates.add(value / 10);
        candidates.add(value / 100);
      }
      if (value > 0 && value < expected) {
        candidates.add(value * 10);
        candidates.add(value * 100);
      }
    });

    return Array.from(candidates)
      .filter((value) => value >= 0 && value <= Math.max(expected * 5, expected + 500));
  }

  private asNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatNumber(value: number, digits: number): string {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private normalizeLabel(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private hasAnyLabel(text: string, labels: string[]): boolean {
    const normalized = this.normalizeLabel(text);
    return labels.some((label) => normalized.includes(this.normalizeLabel(label)));
  }

  private isReceiptLike(text: string): boolean {
    return this.hasAnyLabel(text, ['mot:', 'motorista', 'placa', 'km:', 'lt:', 'r$:', 'data:']);
  }

  private isPhysicalPumpLike(text: string): boolean {
    return this.hasAnyLabel(text, ['wayne', 'litros', 'total', 'bomba', 'volume']);
  }
}
