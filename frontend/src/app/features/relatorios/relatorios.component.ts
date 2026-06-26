// src/app/features/relatorios/relatorios.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario, Veiculo, Abastecimento } from '../../shared/models';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Relatório de abastecimentos por proprietário</p>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field">
            <label>Proprietário</label>
            <div class="autocomplete-field">
              <input
                type="text"
                [value]="proprietarioBusca()"
                placeholder="Digite o proprietário..."
                (input)="onProprietarioBuscaChange($event)"
                (focus)="showProprietarioOptions.set(true)"
                (blur)="closeProprietarioOptions()"
              />
              @if (showProprietarioOptions() && proprietariosFiltrados().length > 0) {
                <div class="autocomplete-list">
                  @for (p of proprietariosFiltrados(); track p.id_proprietario) {
                    <button type="button" class="autocomplete-item" (mousedown)="selectProprietario(p)">
                      {{ p.nome }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
          <div class="filter-field">
            <label>Veículo</label>
            <div class="autocomplete-field">
              <input
                type="text"
                [value]="veiculoBusca()"
                [disabled]="!filters.id_proprietario"
                [placeholder]="filters.id_proprietario ? 'Digite placa/modelo...' : 'Selecione o proprietário primeiro...'"
                (input)="onVeiculoBuscaChange($event)"
                (focus)="showVeiculoOptions.set(true)"
                (blur)="closeVeiculoOptions()"
              />
              @if (veiculoBusca()) {
                <button type="button" class="btn-clear-field" (mousedown)="selectVeiculo(null)">×</button>
              }
              @if (showVeiculoOptions() && veiculosFiltrados().length > 0) {
                <div class="autocomplete-list">
                  <button type="button" class="autocomplete-item" (mousedown)="selectVeiculo(null)">Todos</button>
                  @for (v of veiculosFiltrados(); track v.id_veiculo) {
                    <button type="button" class="autocomplete-item" (mousedown)="selectVeiculo(v)">
                      {{ v.placa }} — {{ v.modelo || 'Sem modelo' }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <div class="date-row">
              <input #dataInicioInput type="date" [(ngModel)]="filters.data_inicio" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataInicioInput)">📅</button>
            </div>
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <div class="date-row">
              <input #dataFimInput type="date" [(ngModel)]="filters.data_fim" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataFimInput)">📅</button>
            </div>
          </div>
          <div class="filter-field">
            <label>Baixa</label>
            <select [(ngModel)]="filters.status">
              <option value="">Todos</option>
              <option value="Pendente">Pendente</option>
              <option value="Pago">Pago</option>
            </select>
          </div>
        </div>
        <div class="filter-actions">
          <button class="btn-search" (click)="load()">
            🔍 Gerar Relatório
          </button>
          @if (relatorio()) {
            <button class="btn-pdf" (click)="exportPdf()">
              📄 Exportar PDF
            </button>
          }
        </div>
      </div>

      <!-- Resultado -->
      @if (loading()) {
        <div class="loading-state"><div class="spinner-lg"></div> Gerando relatório...</div>
      }

      @if (relatorio(); as r) {
        <!-- Cabeçalho do relatório -->
        <div class="report-header">
          <div class="report-title">
            <span class="report-label">{{ r.proprietario ? 'Proprietário' : 'Agrupado por proprietário' }}</span>
            <span class="report-name">{{ r.proprietario?.nome ?? 'Todos os proprietários' }}</span>
            <div class="report-filters">
              @for (filtro of filtrosResumo(); track filtro) {
                <span>{{ filtro }}</span>
              }
            </div>
          </div>
          <div class="totals-row">
            <div class="total-item">
              <span class="total-label">Registros</span>
              <span class="total-value">{{ r.totais.registros }}</span>
            </div>
            <div class="total-item">
              <span class="total-label">Total Litros</span>
              <span class="total-value blue">{{ r.totais.quantidade_litros | number:'1.2-2' }} L</span>
            </div>
            <div class="total-item">
              <span class="total-label">Valor Total</span>
              <span class="total-value green">{{ r.totais.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
            </div>
          </div>
        </div>

        <div class="groups-card">
          @for (grupo of gruposProprietario(); track grupo.id) {
            <div class="owner-group">
              <button type="button" class="owner-summary" (click)="toggleGrupo(grupo.id)">
                <span class="expand-icon">{{ grupo.expanded ? '−' : '+' }}</span>
                <span class="owner-name">{{ grupo.nome }}</span>
                <span class="owner-count">{{ grupo.registros }} registro(s)</span>
                <span class="owner-liters">{{ grupo.litros | number:'1.2-2' }} L</span>
                <span class="owner-total">{{ grupo.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
              </button>

              @if (grupo.expanded) {
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Data e Hora</th>
                        <th>Veículo</th>
                        <th>Motorista</th>
                        <th>Combustível</th>
                        <th class="text-right">Qtd (L)</th>
                        <th class="text-right">R$/L</th>
                        <th class="text-right">Total (R$)</th>
                        <th class="text-center">Baixa</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (a of grupo.abastecimentos; track a.id_abastecimento) {
                        <tr>
                          <td>{{ a.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                          <td>
                            @if (a.veiculo) {
                              <div class="veiculo-cell">
                                <span class="placa-badge">{{ a.veiculo.placa }}</span>
                                <span class="veiculo-model">{{ a.veiculo.modelo }}</span>
                              </div>
                            } @else { — }
                          </td>
                          <td>{{ a.nome_motorista ?? '—' }}</td>
                          <td>{{ a.tipo_combustivel }}</td>
                          <td class="text-right">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                          <td class="text-right">{{ a.valor_por_litro | number:'1.3-3' }}</td>
                          <td class="text-right val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                          <td class="text-center">
                            <span class="badge" [class]="a.baixa_abastecimento ? 'badge-green' : 'badge-orange'">
                              {{ a.baixa_abastecimento ? 'Baixado' : 'Pendente' }}
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          } @empty {
            <div class="empty-cell">Nenhum registro encontrado</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Inter:wght@400;500;600&display=swap');
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#111827; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:16px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; margin-bottom:14px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; display:flex; gap:4px; align-items:center; }
    .req { color:#f87171; }
    .filter-field input, .filter-field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }
    .filter-field input:focus, .filter-field select:focus { border-color:#0ea5e9; }
    .filter-field select option { background:#0d1427; }
    .autocomplete-field { position:relative; }
    .autocomplete-field input { width:100%; padding-right:34px; }
    .btn-clear-field {
      position:absolute; right:6px; top:50%; transform:translateY(-50%);
      width:22px; height:22px; border:none; border-radius:5px; background:#1e2d4a;
      color:#cbd5e1; cursor:pointer; line-height:1; font-size:15px;
    }
    .btn-clear-field:hover { background:#334155; color:#fff; }
    .autocomplete-list {
      position:absolute; z-index:30; top:calc(100% + 4px); left:0; right:0;
      max-height:240px; overflow:auto; background:#0a0f1e; border:1px solid #1e2d4a;
      border-radius:8px; box-shadow:0 16px 40px rgba(2,6,23,0.35); padding:4px;
    }
    .autocomplete-item {
      width:100%; border:none; background:transparent; color:#e2e8f0; text-align:left;
      padding:8px 9px; border-radius:6px; font-size:12px; cursor:pointer;
    }
    .autocomplete-item:hover { background:#1e2d4a; }
    .date-row { display:flex; gap:8px; align-items:center; }
    .date-row input { flex:1; }
    .btn-date { height:34px; min-width:40px; padding:0 10px; background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; color:#94a3b8; cursor:pointer; font-size:14px; }
    .btn-date:hover { border-color:#38bdf8; color:#38bdf8; }

    .filter-actions { display:flex; gap:10px; }
    .btn-search { background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:10px 20px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-search:disabled { opacity:0.4; cursor:not-allowed; }
    .btn-pdf { background:#0f172a; border:1px solid #1e2d4a; border-radius:8px; padding:10px 16px; color:#e2e8f0; font-size:13px; cursor:pointer; }
    .btn-pdf:hover { border-color:#94a3b8; }

    .loading-state { display:flex;align-items:center;gap:10px;padding:40px;justify-content:center;color:#64748b; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg);} }

    .report-header { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }
    .report-title { display:flex; flex-direction:column; }
    .report-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .report-name { font-size:20px; font-weight:700; color:#f8fafc; margin-top:2px; }
    .report-filters { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
    .report-filters span { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:999px; color:#cbd5e1; font-size:11px; padding:4px 8px; }
    .totals-row { display:flex; gap:20px; }
    .total-item { display:flex; flex-direction:column; }
    .total-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .total-value { font-size:18px; font-weight:700; color:#f8fafc; }
    .total-value.blue { color:#38bdf8; }
    .total-value.green { color:#4ade80; }

    .table-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .groups-card { display:flex; flex-direction:column; gap:10px; }
    .owner-group { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .owner-summary {
      width:100%; border:none; background:#0d1427; color:#e2e8f0; padding:12px 14px;
      display:grid; grid-template-columns:auto minmax(180px,1fr) auto auto auto; gap:12px;
      align-items:center; cursor:pointer; text-align:left; font-family:'Inter',sans-serif;
    }
    .owner-summary:hover { background:#111b31; }
    .expand-icon { width:24px; height:24px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background:#1e2d4a; color:#38bdf8; font-weight:800; }
    .owner-name { color:#f8fafc; font-size:14px; font-weight:700; }
    .owner-count { color:#94a3b8; font-size:12px; }
    .owner-liters { color:#38bdf8; font-size:13px; font-weight:700; white-space:nowrap; }
    .owner-total { color:#4ade80; font-size:13px; font-weight:800; white-space:nowrap; }
    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th { padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; background:#080e1c; }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a15; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .data-table tfoot td { padding:10px 12px; border-top:1px solid #1e2d4a; }
    .totals-footer { background:#0a0f1e; }
    .text-right { text-align:right; }
    .text-center { text-align:center; }
    .val-green { color:#4ade80; font-weight:600; }

    .veiculo-cell { display:flex; flex-direction:column; gap:2px; }
    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; font-family:monospace; width:fit-content; }
    .veiculo-model { font-size:10px; color:#64748b; }

    .badge { padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; }
    .badge-green { background:#dcfce720; color:#4ade80; }
    .badge-orange { background:#ffedd520; color:#fb923c; }
    .badge-blue { background:#dbeafe20; color:#60a5fa; }
    .badge-yellow { background:#fef9c320; color:#fbbf24; }
    .badge-red { background:#fee2e220; color:#f87171; }
    .empty-cell { text-align:center; padding:32px; color:#475569; }
  `]
})
export class RelatoriosComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  proprietarios = signal<Proprietario[]>([]);
  veiculos = signal<Veiculo[]>([]);
  relatorio = signal<any | null>(null);
  loading = signal(false);
  gruposExpandidos = signal<Set<string>>(new Set());
  proprietarioBusca = signal('');
  veiculoBusca = signal('');
  showProprietarioOptions = signal(false);
  showVeiculoOptions = signal(false);

  filters: any = { id_proprietario:'', id_veiculo:'', data_inicio:'', data_fim:'', status:'' };

  proprietariosFiltrados = computed(() => {
    const term = this.normalizeText(this.proprietarioBusca());
    if (!term) return this.proprietarios().slice(0, 40);
    return this.proprietarios().filter(p => this.normalizeText(p.nome).includes(term)).slice(0, 40);
  });

  veiculosFiltrados = computed(() => {
    const term = this.normalizeText(this.veiculoBusca());
    if (!term) return this.veiculos().slice(0, 40);
    return this.veiculos()
      .filter(v => this.normalizeText(`${v.placa} ${v.modelo ?? ''}`).includes(term))
      .slice(0, 40);
  });

  gruposProprietario = computed(() => {
    const rel = this.relatorio();
    const rows = (rel?.abastecimentos ?? []) as Abastecimento[];
    const map = new Map<string, {
      id: string;
      nome: string;
      abastecimentos: Abastecimento[];
      litros: number;
      valor: number;
      registros: number;
      expanded: boolean;
    }>();

    for (const row of rows) {
      const id = String(row.id_proprietario ?? 'sem-proprietario');
      const nome = String(row.nome_proprietario ?? row.proprietario?.nome ?? 'Sem proprietário');
      if (!map.has(id)) {
        map.set(id, { id, nome, abastecimentos: [], litros: 0, valor: 0, registros: 0, expanded: this.gruposExpandidos().has(id) });
      }
      const grupo = map.get(id)!;
      grupo.abastecimentos.push(row);
      grupo.litros += Number(row.quantidade_litros ?? 0);
      grupo.valor += Number(row.valor_total ?? 0);
      grupo.registros += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
  });

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
  }

  onProprietarioChange() {
    const id = this.filters.id_proprietario;
    this.veiculos.set([]);
    this.filters.id_veiculo = '';
    this.veiculoBusca.set('');
    if (id) {
      this.api.getVeiculosByProprietario(id).subscribe(v => this.veiculos.set(v));
    }
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  onProprietarioBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.proprietarioBusca.set(value);
    this.showProprietarioOptions.set(true);
    const exact = this.proprietarios().find(p => this.normalizeText(p.nome) === this.normalizeText(value));
    this.filters.id_proprietario = exact?.id_proprietario ?? '';
    this.onProprietarioChange();
  }

  selectProprietario(p: Proprietario) {
    this.filters.id_proprietario = p.id_proprietario;
    this.proprietarioBusca.set(p.nome);
    this.showProprietarioOptions.set(false);
    this.onProprietarioChange();
  }

  closeProprietarioOptions() {
    setTimeout(() => this.showProprietarioOptions.set(false), 120);
  }

  onVeiculoBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.veiculoBusca.set(value);
    this.showVeiculoOptions.set(true);
    const exact = this.veiculos().find(v => this.normalizeText(`${v.placa} ${v.modelo ?? ''}`) === this.normalizeText(value));
    this.filters.id_veiculo = exact?.id_veiculo ?? '';
  }

  selectVeiculo(v: Veiculo | null) {
    this.filters.id_veiculo = v?.id_veiculo ?? '';
    this.veiculoBusca.set(v ? `${v.placa} — ${v.modelo || 'Sem modelo'}` : '');
    this.showVeiculoOptions.set(false);
  }

  closeVeiculoOptions() {
    setTimeout(() => this.showVeiculoOptions.set(false), 120);
  }

  load() {
    this.loading.set(true);
    this.api.getRelatorioProprietario(this.filters).subscribe({
      next: r => {
        this.relatorio.set(r);
        const grupos = new Set<string>();
        if (r?.proprietario?.id_proprietario) {
          grupos.add(String(r.proprietario.id_proprietario));
        }
        this.gruposExpandidos.set(grupos);
        this.loading.set(false);
      },
      error: () => { this.toastr.error('Erro ao gerar relatório'); this.loading.set(false); }
    });
  }

  toggleGrupo(id: string) {
    const next = new Set(this.gruposExpandidos());
    next.has(id) ? next.delete(id) : next.add(id);
    this.gruposExpandidos.set(next);
  }

  filtrosResumo(): string[] {
    return [
      `Proprietário: ${this.proprietarioBusca().trim() || 'Todos'}`,
      `Veículo: ${this.veiculoBusca().trim() || 'Todos'}`,
      `Período: ${this.filters.data_inicio || 'Início'} até ${this.filters.data_fim || 'Hoje'}`,
      `Baixa: ${this.filters.status || 'Todos'}`,
    ];
  }

  exportPdf() {
    const rel = this.relatorio();
    if (!rel) {
      this.toastr.warning('Gere o relatório antes de exportar');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const left = 26;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const right = pageWidth - left;
    let y = 34;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Relatório por Proprietário', left, y);

    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80);
    for (const filtro of this.filtrosResumo()) {
      doc.text(filtro, left, y);
      y += 13;
    }
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Registros: ${rel.totais?.registros ?? 0}`, left, y);
    doc.text(`Litros: ${Number(rel.totais?.quantidade_litros ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, left + 120, y);
    doc.text(`Valor Total: ${Number(rel.totais?.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, left + 285, y);

    y += 20;
    doc.setDrawColor(200);
    doc.line(left, y, right, y);
    y += 14;

    const headers = ['Data/Hora', 'Placa', 'Motorista', 'Litros', 'R$/L', 'Total'];
    const widths = [104, 62, 130, 58, 54, 92];

    const drawHeader = () => {
      let x = left;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      headers.forEach((h, idx) => {
        doc.text(h, x, y);
        x += widths[idx];
      });
      y += 10;
      doc.setDrawColor(220);
      doc.line(left, y, right, y);
      y += 12;
    };

    drawHeader();

    const rows = (rel.abastecimentos ?? []) as Abastecimento[];
    for (const item of rows) {
      if (y > pageHeight - 48) {
        doc.addPage();
        y = 34;
        drawHeader();
      }

      const dataHora = item.data_hora ? new Date(item.data_hora as any) : null;
      const dataHoraFmt = dataHora && !isNaN(dataHora.getTime()) ? dataHora.toLocaleString('pt-BR') : '—';

      const values = [
        dataHoraFmt,
        item.veiculo?.placa ?? '—',
        item.nome_motorista ?? '—',
        Number(item.quantidade_litros ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        Number(item.valor_por_litro ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
        Number(item.valor_total ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      ];

      let x = left;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      values.forEach((v, idx) => {
        const maxChars = Math.max(8, Math.floor(widths[idx] / 4.6));
        const rawText = String(v);
        const text = idx === 0 || rawText.length <= maxChars ? rawText : `${rawText.slice(0, maxChars - 1)}…`;
        doc.text(text, x, y);
        x += widths[idx];
      });
      y += 12;
    }

    const filename = `relatorio_${this.filters.id_proprietario || 'geral'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  }

  openDatePicker(input: HTMLInputElement) {
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {}
    input.focus();
  }

  getStatusClass(status?: string): string {
    if (status === 'Pago') return 'badge badge-green';
    if (status === 'Confirmado') return 'badge badge-blue';
    if (status === 'Cancelado') return 'badge badge-red';
    return 'badge badge-yellow';
  }
}
