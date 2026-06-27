import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface EntradaNotasFilters {
  tipo: string;
  numero_nota_fiscal: string;
  data_inicio: string;
  data_fim: string;
  fornecedor: string;
}

@Component({
  selector: 'app-entrada-notas-filters',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './entrada-notas-filters.component.html',
  styleUrl: './entrada-notas-filters.component.css'
})
export class EntradaNotasFiltersComponent implements OnInit {
  private fb = inject(FormBuilder);

  @Input() tiposCombustivel: string[] = [];
  @Input() fornecedoresDisponiveis: string[] = [];
  
  @Output() filterChanged = new EventEmitter<EntradaNotasFilters>();

  filterForm: FormGroup = this.fb.group({
    tipo: [''],
    numero_nota_fiscal: [''],
    data_inicio: [''],
    data_fim: [''],
    fornecedor: ['']
  });

  constructor() {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        takeUntilDestroyed()
      )
      .subscribe(value => {
        this.filterChanged.emit(value as EntradaNotasFilters);
      });
  }

  ngOnInit() {}

  openDatePicker(input: HTMLInputElement) {
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {}
    input.focus();
    input.click();
  }
}
