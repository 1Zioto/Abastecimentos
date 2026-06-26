import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { Abastecimento, BaixaAbastecimento, Motorista, PaginatedResponse, Proprietario, Veiculo } from '../../models';

export type LinkedEntityType = 'proprietario' | 'veiculo' | 'motorista';

export interface LinkedEntityContext {
  type: LinkedEntityType;
  entity: Proprietario | Veiculo | Motorista;
}

@Component({
  selector: 'app-vinculos-entidade-modal',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    @if (context) {
      <div class="modal-overlay" (click)="close()">
        <section class="modal-shell" (click)="$event.stopPropagation()">
          <header class="modal-header">
            <div>
              <span class="eyebrow">{{ tipoLabel() }}</span>
              <h2>{{ titulo() }}</h2>
              <p>{{ subtitulo() }}</p>
            </div>
            <button type="button" class="btn-close" (click)="close()" aria-label="Fechar">×</button>
          </header>

          <div class="summary-row">
            <div class="summary-item">
              <span>Abastecimentos</span>
              <strong>{{ abastecimentos().length }}</strong>
            </div>
            <div class="summary-item">
              <span>Pendentes</span>
              <strong>{{ totalPendentes() }}</strong>
            </div>
            <div class="summary-item">
              <span>Pagos</span>
              <strong>{{ totalPagos() }}</strong>
            </div>
            <div class="summary-item">
              <span>Valor pendente</span>
              <strong>{{ money(valorPendente()) }}</strong>
            </div>
          </div>

          <nav class="tabs">
            <button type="button" [class.active]="activeTab() === 'detalhes'" (click)="activeTab.set('detalhes')">Detalhes</button>
            @if (context.type === 'proprietario') {
              <button type="button" [class.active]="activeTab() === 'veiculos'" (click)="activeTab.set('veiculos')">Veículos</button>
              <button type="button" [class.active]="activeTab() === 'motoristas'" (click)="activeTab.set('motoristas')">Motoristas</button>
            }
            <button type="button" [class.active]="activeTab() === 'abastecimentos'" (click)="activeTab.set('abastecimentos')">Abastecimentos</button>
            <button type="button" [class.active]="activeTab() === 'baixas'" (click)="activeTab.set('baixas')">Baixas</button>
          </nav>

          @if (loading()) {
            <div class="loading">Carregando vínculos...</div>
          } @else {
            <div class="tab-content">
              @if (activeTab() === 'detalhes') {
                <div class="detail-grid">
                  @for (item of detalheItens(); track item.label) {
                    <div class="detail-item">
                      <span>{{ item.label }}</span>
                      <strong>{{ item.value }}</strong>
                    </div>
                  }
                </div>
              }

              @if (activeTab() === 'veiculos') {
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Placa</th><th>Modelo</th><th>Combustível</th><th>Odômetro</th><th>Filial</th></tr>
                    </thead>
                    <tbody>
                      @for (v of veiculos(); track v.id_veiculo) {
                        <tr>
                          <td><span class="placa">{{ v.placa }}</span></td>
                          <td>{{ textoVeiculo(v) }}</td>
                          <td>{{ v.tipo_combustivel || '—' }}</td>
                          <td>{{ v.odometro ? number(v.odometro) + ' km' : '—' }}</td>
                          <td>{{ v.local || '—' }}</td>
                        </tr>
                      }
                      @empty { <tr><td colspan="5" class="empty">Nenhum veículo vinculado</td></tr> }
                    </tbody>
                  </table>
                </div>
              }

              @if (activeTab() === 'motoristas') {
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Nome</th><th>Apelido</th><th>Documento</th><th>Celular</th><th>Filial</th></tr>
                    </thead>
                    <tbody>
                      @for (m of motoristas(); track m.id_motorista) {
                        <tr>
                          <td><strong>{{ m.nome }}</strong></td>
                          <td>{{ m.apelido || '—' }}</td>
                          <td>{{ m.documento || '—' }}</td>
                          <td>{{ m.celular || '—' }}</td>
                          <td>{{ m.local || '—' }}</td>
                        </tr>
                      }
                      @empty { <tr><td colspan="5" class="empty">Nenhum motorista vinculado</td></tr> }
                    </tbody>
                  </table>
                </div>
              }

              @if (activeTab() === 'abastecimentos') {
                <div class="filter-line">
                  <span>Filtrar baixa</span>
                  <button type="button" [class.active]="baixaFilter() === 'todos'" (click)="baixaFilter.set('todos')">Todos</button>
                  <button type="button" [class.active]="baixaFilter() === 'pendentes'" (click)="baixaFilter.set('pendentes')">Pendentes</button>
                  <button type="button" [class.active]="baixaFilter() === 'pagos'" (click)="baixaFilter.set('pagos')">Pagos</button>
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Data</th><th>Placa</th><th>Motorista</th><th>Litros</th><th>Valor</th><th>Baixa</th><th></th></tr>
                    </thead>
                    <tbody>
                      @for (a of abastecimentosFiltrados(); track a.id_abastecimento) {
                        <tr>
                          <td>{{ a.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                          <td><span class="placa">{{ a.veiculo?.placa || a.placa1 || '—' }}</span></td>
                          <td>{{ a.nome_motorista || a.motorista?.nome || '—' }}</td>
                          <td>{{ litros(a.quantidade_litros) }}</td>
                          <td>{{ money(a.valor_total) }}</td>
                          <td><span class="badge" [class.paid]="a.baixa_abastecimento">{{ a.baixa_abastecimento ? 'Pago' : 'Pendente' }}</span></td>
                          <td><a [routerLink]="['/abastecimentos', a.id_abastecimento, 'editar']">Abrir</a></td>
                        </tr>
                      }
                      @empty { <tr><td colspan="7" class="empty">Nenhum abastecimento encontrado</td></tr> }
                    </tbody>
                  </table>
                </div>
              }

              @if (activeTab() === 'baixas') {
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Data baixa</th><th>Pagamento</th><th>Placa</th><th>Abastecimento</th><th>Valor</th><th>Forma</th><th>Usuário</th></tr>
                    </thead>
                    <tbody>
                      @for (b of baixas(); track b.id_baixa) {
                        <tr>
                          <td>{{ b.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                          <td>{{ b.data_pagamento | date:'dd/MM/yyyy' }}</td>
                          <td><span class="placa">{{ b.abastecimento?.veiculo?.placa || b.abastecimento?.placa1 || '—' }}</span></td>
                          <td>{{ b.abastecimento?.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                          <td>{{ money(b.abastecimento?.valor_total || b.abastecimento?.valor) }}</td>
                          <td>{{ b.forma_pagamento || '—' }}</td>
                          <td>{{ b.usuario || '—' }}</td>
                        </tr>
                      }
                      @empty { <tr><td colspan="7" class="empty">Nenhuma baixa vinculada</td></tr> }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    *{box-sizing:border-box}
    .modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;z-index:1200;padding:24px}
    .modal-shell{width:min(1120px,96vw);max-height:88vh;overflow:hidden;background:#fff;border:1px solid #d8e0ea;border-radius:12px;box-shadow:0 24px 70px rgba(15,23,42,.28);display:flex;flex-direction:column;color:#0f172a}
    .modal-header{display:flex;justify-content:space-between;gap:18px;padding:22px 24px 16px;border-bottom:1px solid #e2e8f0}
    .eyebrow{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#0ea5e9}
    h2{margin:4px 0 4px;font-size:24px;line-height:1.1;color:#0f172a}
    p{margin:0;color:#64748b;font-size:13px}
    .btn-close{width:38px;height:38px;border:none;border-radius:8px;background:#f1f5f9;color:#334155;font-size:28px;line-height:1;cursor:pointer}
    .btn-close:hover{background:#e2e8f0}
    .summary-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
    .summary-item{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#fff}
    .summary-item span{display:block;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
    .summary-item strong{display:block;margin-top:4px;color:#0f172a;font-size:18px}
    .tabs{display:flex;gap:6px;padding:12px 24px;border-bottom:1px solid #e2e8f0;background:#fff}
    .tabs button,.filter-line button{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer}
    .tabs button.active,.filter-line button.active{background:#0ea5e9;border-color:#0ea5e9;color:#fff}
    .tab-content{padding:18px 24px 24px;overflow:auto}
    .loading{padding:40px;text-align:center;color:#64748b}
    .detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
    .detail-item{border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc}
    .detail-item span{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#64748b}
    .detail-item strong{display:block;margin-top:5px;color:#0f172a;font-size:14px;word-break:break-word}
    .filter-line{display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .filter-line span{color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
    .table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:10px}
    table{width:100%;border-collapse:collapse;font-size:12px;background:#fff}
    th{padding:10px 12px;text-align:left;background:#f8fafc;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e2e8f0;white-space:nowrap}
    td{padding:10px 12px;border-bottom:1px solid #eef2f7;color:#334155;white-space:nowrap}
    tbody tr:hover td{background:#f8fafc}
    .placa{display:inline-flex;background:#e0f2fe;color:#0369a1;border-radius:6px;padding:3px 8px;font-family:monospace;font-weight:800}
    .badge{display:inline-flex;border-radius:20px;padding:3px 9px;font-size:10px;font-weight:900;text-transform:uppercase;background:#ffedd5;color:#c2410c}
    .badge.paid{background:#dcfce7;color:#15803d}
    .empty{text-align:center;color:#94a3b8;padding:28px}
    a{font-weight:800;color:#0284c7;text-decoration:none}
    a:hover{text-decoration:underline}
    @media (max-width:760px){
      .modal-overlay{padding:10px}
      .modal-shell{max-height:94vh}
      .summary-row{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px}
      .modal-header,.tabs,.tab-content{padding-left:14px;padding-right:14px}
      .tabs{overflow:auto}
    }
  `]
})
export class VinculosEntidadeModalComponent implements OnChanges {
  private api = inject(ApiService);

  @Input() context: LinkedEntityContext | null = null;
  @Output() closed = new EventEmitter<void>();

  activeTab = signal<'detalhes' | 'veiculos' | 'motoristas' | 'abastecimentos' | 'baixas'>('detalhes');
  baixaFilter = signal<'todos' | 'pendentes' | 'pagos'>('todos');
  loading = signal(false);
  veiculos = signal<Veiculo[]>([]);
  motoristas = signal<Motorista[]>([]);
  abastecimentos = signal<Abastecimento[]>([]);
  baixas = signal<BaixaAbastecimento[]>([]);

  abastecimentosFiltrados = computed(() => {
    const filtro = this.baixaFilter();
    return this.abastecimentos().filter((item) => {
      if (filtro === 'todos') return true;
      return filtro === 'pagos' ? !!item.baixa_abastecimento : !item.baixa_abastecimento;
    });
  });

  totalPendentes = computed(() => this.abastecimentos().filter((item) => !item.baixa_abastecimento).length);
  totalPagos = computed(() => this.abastecimentos().filter((item) => !!item.baixa_abastecimento).length);
  valorPendente = computed(() => this.abastecimentos()
    .filter((item) => !item.baixa_abastecimento)
    .reduce((total, item) => total + Number(item.valor_total ?? 0), 0));

  ngOnChanges(): void {
    if (!this.context) return;
    this.activeTab.set('detalhes');
    this.baixaFilter.set('todos');
    this.loadLinks();
  }

  close() {
    this.closed.emit();
  }

  tipoLabel() {
    if (this.context?.type === 'proprietario') return 'Proprietário';
    if (this.context?.type === 'veiculo') return 'Veículo';
    return 'Motorista';
  }

  titulo() {
    const entity = this.context?.entity as any;
    if (!entity) return '';
    if (this.context?.type === 'veiculo') return entity.placa || 'Veículo';
    return entity.nome || 'Cadastro';
  }

  subtitulo() {
    const entity = this.context?.entity as any;
    if (!entity) return '';
    if (this.context?.type === 'proprietario') return [entity.local, entity.status].filter(Boolean).join(' • ') || 'Vínculos do cadastro';
    if (this.context?.type === 'veiculo') return [this.textoVeiculo(entity), entity.proprietario?.nome].filter(Boolean).join(' • ') || 'Vínculos do veículo';
    return [entity.apelido, entity.proprietario?.nome].filter(Boolean).join(' • ') || 'Vínculos do motorista';
  }

  detalheItens() {
    const entity = this.context?.entity as any;
    if (!entity) return [];
    if (this.context?.type === 'proprietario') {
      return [
        { label: 'Nome', value: entity.nome || '—' },
        { label: 'Status', value: entity.status || '—' },
        { label: 'Responsável', value: entity.responsavel || '—' },
        { label: 'Celular', value: entity.celular || '—' },
        { label: 'Filial', value: entity.local || '—' },
        { label: 'Odômetro', value: entity.odometro_obrigatorio ? 'Obrigatório' : 'Opcional' },
        { label: 'Observação', value: entity.observacao || '—' },
      ];
    }
    if (this.context?.type === 'veiculo') {
      return [
        { label: 'Placa', value: entity.placa || '—' },
        { label: 'Proprietário', value: entity.proprietario?.nome || '—' },
        { label: 'Marca/Modelo', value: this.textoVeiculo(entity) },
        { label: 'Ano', value: entity.ano || '—' },
        { label: 'Combustível', value: entity.tipo_combustivel || '—' },
        { label: 'Odômetro', value: entity.odometro ? `${this.number(entity.odometro)} km` : '—' },
        { label: 'Filial', value: entity.local || '—' },
        { label: 'RENAVAM', value: entity.renavam || '—' },
      ];
    }
    return [
      { label: 'Nome', value: entity.nome || '—' },
      { label: 'Apelido', value: entity.apelido || '—' },
      { label: 'Empresa responsável', value: entity.proprietario?.nome || '—' },
      { label: 'Documento', value: entity.documento || '—' },
      { label: 'Celular', value: entity.celular || '—' },
      { label: 'Filial', value: entity.local || '—' },
    ];
  }

  textoVeiculo(v: Veiculo) {
    return [v.marca, v.modelo].filter(Boolean).join(' ') || '—';
  }

  money(value: unknown) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  litros(value: unknown) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '—';
    return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} L`;
  }

  number(value: unknown) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);
  }

  private loadLinks() {
    const context = this.context;
    if (!context) return;

    this.loading.set(true);
    this.veiculos.set([]);
    this.motoristas.set([]);
    this.abastecimentos.set([]);
    this.baixas.set([]);

    const filters = this.filtersForContext(context);
    const emptyPage = <T>() => ({ data: [] as T[], current_page: 1, last_page: 1, per_page: 500, total: 0, from: 0, to: 0 } as PaginatedResponse<T>);

    forkJoin({
      veiculos: context.type === 'proprietario'
        ? this.api.getVeiculos({ ...filters, per_page: 500 }).pipe(catchError(() => of(emptyPage<Veiculo>())))
        : of(emptyPage<Veiculo>()),
      motoristas: context.type === 'proprietario'
        ? this.api.getMotoristas({ ...filters, per_page: 500 }).pipe(catchError(() => of(emptyPage<Motorista>())))
        : of(emptyPage<Motorista>()),
      abastecimentos: this.api.getAbastecimentos({ ...filters, per_page: 500, sort_by: 'data_hora', sort_dir: 'desc' }).pipe(catchError(() => of(emptyPage<Abastecimento>()))),
      baixas: this.api.getBaixas({ ...filters, per_page: 500 }).pipe(catchError(() => of(emptyPage<BaixaAbastecimento>()))),
    }).subscribe({
      next: ({ veiculos, motoristas, abastecimentos, baixas }) => {
        this.veiculos.set(veiculos.data ?? []);
        this.motoristas.set(motoristas.data ?? []);
        this.abastecimentos.set(abastecimentos.data ?? []);
        this.baixas.set(baixas.data ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private filtersForContext(context: LinkedEntityContext): Record<string, string> {
    const entity = context.entity as any;
    if (context.type === 'proprietario') return { id_proprietario: entity.id_proprietario };
    if (context.type === 'veiculo') return { id_veiculo: entity.id_veiculo };
    return { id_motorista: entity.id_motorista };
  }
}
