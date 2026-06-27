import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface FornecedorResumo {
  nome: string;
  notas: number;
  litros: number;
  valor: number;
}

@Component({
  selector: 'app-entrada-notas-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entrada-notas-summary.component.html',
  styleUrl: './entrada-notas-summary.component.css'
})
export class EntradaNotasSummaryComponent {
  @Input() fornecedoresResumo: FornecedorResumo[] = [];
  @Input() notasLength: number = 0;
  @Input() totalLitros: number = 0;
  @Input() totalValor: number = 0;
  @Input() totalTransporte: number = 0;
  @Input() totalCompraFinal: number = 0;
}
