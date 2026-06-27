// src/app/features/lancar-sofit/lancar-sofit.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Abastecimento, Proprietario } from '../../shared/models';

interface GrupoPlaca {
  placa: string;
  proprietarios: string;
  registros: number;
  litros: number;
  valor: number;
  abastecimentos: Abastecimento[];
  expanded: boolean;
}

@Component({
  selector: 'app-lancar-sofit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <a routerLink="/abastecimentos" class="back-link">← Abastecimentos</a>
          <h1>Lançar no Sofit</h1>
          <p>Abastecimentos agrupados por placa — selecione um grupo e lance no Sofit</p>
        </div>
        <div class="summary-chips">
          <span class="chip chip-blue">{{ totalRegistros() }} abastecimento(s)</span>
          <span class="chip chip-green">{{ totalValor() | currency:'BRL':'symbol':'1.2-2' }}</span>
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
                (focus)="showProprietariosDropdown.set(true)"
                (blur)="closeProprietariosDropdown()"
              />
              @if (proprietarioBusca()) {
                <button type="button" class="btn-clear-field" (mousedown)="clearProprietario()">×</button>
              }
              @if (showProprietariosDropdown() && filteredProprietarios().length > 0) {
                <div class="autocomplete-list">
                  <button type="button" class="autocomplete-item" (mousedown)="selectProprietario(null)">Todos</button>
                  @for (p of filteredProprietarios(); track p.id_proprietario) {
                    <button type="button" class="autocomplete-item" (mousedown)="selectProprietario(p)">
                      {{ p.nome }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
          <div class="filter-field">
            <label>Placa</label>
            <input type="text" [(ngModel)]="filters.placa" placeholder="ABC-1234" (input)="load()" />
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <input type="date" [(ngModel)]="filters.data_inicio" (change)="load()" />
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <input type="date" [(ngModel)]="filters.data_fim" (change)="load()" />
          </div>
        </div>
        <button class="btn-clear" (click)="clearFilters()">Limpar Filtros</button>
      </div>

      <!-- Grupos por placa -->
      @if (loading()) {
        <div class="loading-state"><div class="spinner-lg"></div> Carregando abastecimentos...</div>
      } @else {
        <div class="groups-card">
          @for (grupo of gruposPlaca(); track grupo.placa) {
            <div class="placa-group">
              <div class="placa-summary">
                <button type="button" class="expand-btn" (click)="toggleGrupo(grupo.placa)">
                  <span class="expand-icon">{{ grupo.expanded ? '−' : '+' }}</span>
                  <span class="placa-badge">{{ grupo.placa }}</span>
                  <span class="placa-prop">{{ grupo.proprietarios }}</span>
                  <span class="placa-count">{{ grupo.registros }} registro(s)</span>
                  <span class="placa-liters">{{ grupo.litros | number:'1.2-2' }} L</span>
                  <span class="placa-total">{{ grupo.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
                  <span class="sofit-resumo">{{ resumoSofitGrupo(grupo) }}</span>
                </button>
              </div>

              @if (grupo.expanded) {
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Data e Hora</th>
                        <th>Proprietário</th>
                        <th>Motorista</th>
                        <th>Combustível</th>
                        <th class="text-right">Qtd (L)</th>
                        <th class="text-right">R$/L</th>
                        <th class="text-right">Total (R$)</th>
                        <th>KM (editável)</th>
                        <th>Cód. Viagem</th>
                        <th class="text-center">Baixa</th>
                        <th class="text-center">Sofit</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (a of grupo.abastecimentos; track a.id_abastecimento) {
                        <tr>
                          <td>{{ a.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                          <td>{{ a.nome_proprietario || a.proprietario?.nome || '—' }}</td>
                          <td>{{ a.nome_motorista || a.motorista?.nome || '—' }}</td>
                          <td>{{ a.tipo_combustivel || '—' }}</td>
                          <td class="text-right">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                          <td class="text-right">{{ a.valor_por_litro | number:'1.3-3' }}</td>
                          <td class="text-right val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                          <td>
                            @if (sofitStatus(a) === 'lancado') {
                              {{ a.odometro ?? '—' }}
                            } @else {
                              <input
                                type="number"
                                class="inline-input km-input"
                                [(ngModel)]="kmInput[a.id_abastecimento]"
                                placeholder="KM"
                                min="0"
                              />
                            }
                          </td>
                          <td>
                            @if (sofitStatus(a) === 'lancado') {
                              {{ a.sofit_trip_id || '—' }}
                            } @else {
                              <input
                                type="text"
                                class="inline-input trip-input"
                                [(ngModel)]="tripInput[a.id_abastecimento]"
                                placeholder="Cód. viagem"
                              />
                            }
                          </td>
                          <td class="text-center">
                            <span class="badge" [class]="a.baixa_abastecimento ? 'badge-green' : 'badge-orange'">
                              {{ a.baixa_abastecimento ? 'Baixado' : 'Pendente' }}
                            </span>
                          </td>
                          <td class="text-center sofit-cell">
                            @if (sofitStatus(a) === 'lancado') {
                              <span class="badge badge-green" [title]="'ID Sofit: ' + (sofitId(a) || '')">✓ Lançado</span>
                            } @else {
                              <div class="sofit-data-temp" title="Data/hora usada APENAS no lançamento ao Sofit — não altera o registro do abastecimento">
                                <label>📅 Data/hora p/ Sofit (temporária)</label>
                                <input
                                  type="datetime-local"
                                  class="inline-input data-sofit-input"
                                  [(ngModel)]="dataHoraSofitInput[a.id_abastecimento]"
                                />
                              </div>
                              @if (sofitStatus(a) === 'erro_motorista') {
                                <input
                                  type="text"
                                  class="inline-input motorista-input"
                                  [(ngModel)]="motoristaSofitInput[a.id_abastecimento]"
                                  placeholder="Nome no Sofit..."
                                  title="Informe o nome do motorista exatamente como está cadastrado no Sofit. O vínculo fica salvo para as próximas vezes."
                                />
                              }
                              <button
                                type="button"
                                class="btn-sofit-row"
                                [class.btn-sofit-erro]="sofitStatus(a) === 'erro'"
                                [disabled]="lancando().has(a.id_abastecimento) || (sofitStatus(a) === 'erro_motorista' && !(motoristaSofitInput[a.id_abastecimento] || '').trim())"
                                [title]="sofitStatus(a) === 'erro' ? 'Último erro: ' + (sofitRetorno(a) || '') : 'Lançar este abastecimento no Sofit'"
                                (click)="lancarNoSofit(a)"
                              >
                                {{ lancando().has(a.id_abastecimento)
                                    ? 'Lançando...'
                                    : (sofitStatus(a) === 'erro_motorista'
                                        ? '↻ Relançar com este nome'
                                        : (sofitStatus(a) === 'erro' ? '↻ Tentar de novo' : '🚀 Lançar no Sofit')) }}
                              </button>
                              @if (sofitStatus(a) === 'erro' || sofitStatus(a) === 'erro_motorista') {
                                <small class="sofit-erro-msg">{{ sofitRetorno(a) }}</small>
                              }
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          } @empty {
            <div class="empty-cell">Nenhum abastecimento encontrado para os filtros.</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { margin-bottom:20px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .back-link { font-size:12px; color:#38bdf8; text-decoration:none; display:block; margin-bottom:6px; }
    .back-link:hover { text-decoration:underline; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:12px; color:#64748b; margin-top:4px; }
    .summary-chips { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .chip { padding:5px 12px; border-radius:20px; font-size:12px; font-weight:700; }
    .chip-blue { background:#0ea5e920; color:#38bdf8; border:1px solid #0ea5e930; }
    .chip-green { background:#4ade8020; color:#4ade80; border:1px solid #4ade8030; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:16px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-bottom:12px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .filter-field input {
      background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px;
      padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none;
    }
    .filter-field input:focus { border-color:#0ea5e9; }
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
    .btn-clear { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:6px 14px; border-radius:6px; font-size:12px; cursor:pointer; }
    .btn-clear:hover { border-color:#94a3b8; color:#94a3b8; }

    .loading-state { display:flex; align-items:center; gap:10px; padding:40px; justify-content:center; color:#64748b; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg);} }

    .groups-card { display:flex; flex-direction:column; gap:10px; }
    .placa-group { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .placa-summary { display:flex; align-items:center; gap:10px; padding-right:12px; }
    .expand-btn {
      flex:1; border:none; background:#0d1427; color:#e2e8f0; padding:12px 14px;
      display:grid; grid-template-columns:auto auto minmax(140px,1fr) auto auto auto auto; gap:12px;
      align-items:center; cursor:pointer; text-align:left; font-family:'Inter',sans-serif; min-width:0;
    }
    .sofit-resumo { color:#94a3b8; font-size:11px; font-weight:700; background:#0a0f1e; border:1px solid #1e2d4a; border-radius:999px; padding:3px 10px; white-space:nowrap; }
    .expand-btn:hover { background:#111b31; }
    .expand-icon { width:24px; height:24px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background:#1e2d4a; color:#38bdf8; font-weight:800; }
    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:4px 10px; border-radius:6px; font-size:13px; font-weight:800; font-family:monospace; white-space:nowrap; }
    .placa-prop { color:#94a3b8; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .placa-count { color:#94a3b8; font-size:12px; white-space:nowrap; }
    .placa-liters { color:#38bdf8; font-size:13px; font-weight:700; white-space:nowrap; }
    .placa-total { color:#4ade80; font-size:13px; font-weight:800; white-space:nowrap; }
    .btn-sofit-row {
      background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:7px;
      padding:6px 12px; color:#fff; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap;
    }
    .btn-sofit-row:hover:not(:disabled) { opacity:0.9; }
    .btn-sofit-row:disabled { opacity:0.5; cursor:wait; }
    .btn-sofit-row.btn-sofit-erro { background:#7f1d1d; border:1px solid #ef4444; }
    .sofit-cell { min-width:150px; }
    .inline-input {
      background:#0a0f1e; border:1px solid #1e2d4a; border-radius:6px;
      padding:6px 8px; color:#e2e8f0; font-size:12px; outline:none;
    }
    .inline-input:focus { border-color:#0ea5e9; }
    .km-input { width:96px; }
    .trip-input { width:120px; }
    .motorista-input { width:170px; display:block; margin:0 auto 6px; border-color:#f59e0b60; }
    .motorista-input:focus { border-color:#f59e0b; }
    .sofit-data-temp { margin:0 auto 8px; max-width:190px; text-align:center; }
    .sofit-data-temp label { display:block; font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:3px; }
    .data-sofit-input { width:185px; border-color:#0ea5e955; }
    .data-sofit-input:focus { border-color:#38bdf8; }
    .sofit-erro-msg { display:block; margin-top:4px; color:#f87171; font-size:10px; max-width:180px; white-space:normal; line-height:1.25; }

    .table-wrap { overflow-x:auto; border-top:1px solid #1e2d4a; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th { padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; background:#080e1c; white-space:nowrap; }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a15; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .text-right { text-align:right; }
    .text-center { text-align:center; }
    .val-green { color:#4ade80; font-weight:600; }
    .badge { padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; }
    .badge-green { background:#dcfce720; color:#4ade80; }
    .badge-orange { background:#ffedd520; color:#fb923c; }
    .empty-cell { text-align:center; padding:32px; color:#475569; background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; }

    @media (max-width: 760px) {
      .placa-summary { flex-direction:column; align-items:stretch; gap:0; padding:0; }
      .expand-btn { grid-template-columns:auto auto 1fr auto; }
      .placa-liters, .placa-total, .placa-count { display:none; }
    }
  `]
})
export class LancarSofitComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  abastecimentos = signal<Abastecimento[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  loading = signal(true);
  lancando = signal<Set<string>>(new Set());

  // Campos editáveis por linha (KM, Código da Viagem e correção do motorista)
  kmInput: Record<string, number | null> = {};
  tripInput: Record<string, string> = {};
  motoristaSofitInput: Record<string, string> = {};
  // Data/hora TEMPORÁRIA usada só no lançamento ao Sofit (não altera o registro)
  dataHoraSofitInput: Record<string, string> = {};
  gruposExpandidos = signal<Set<string>>(new Set());
  proprietarioBusca = signal('');
  showProprietariosDropdown = signal(false);

  filters: any = { id_proprietario: '', placa: '', data_inicio: '', data_fim: '' };

  filteredProprietarios = computed(() => {
    const term = this.normalizeText(this.proprietarioBusca());
    if (!term) return this.proprietarios().slice(0, 40);
    return this.proprietarios()
      .filter((p) => this.normalizeText(p.nome).includes(term))
      .slice(0, 40);
  });

  totalRegistros = computed(() => this.abastecimentos().length);
  totalValor = computed(() =>
    this.abastecimentos().reduce((s, a) => s + this.toNum(a.valor_total), 0)
  );

  gruposPlaca = computed<GrupoPlaca[]>(() => {
    const expandidos = this.gruposExpandidos();
    const map = new Map<string, GrupoPlaca>();

    for (const a of this.abastecimentos()) {
      const placa = (a.veiculo?.placa ?? a.id_veiculo ?? 'SEM PLACA').toString().trim().toUpperCase() || 'SEM PLACA';
      if (!map.has(placa)) {
        map.set(placa, {
          placa,
          proprietarios: '',
          registros: 0,
          litros: 0,
          valor: 0,
          abastecimentos: [],
          expanded: expandidos.has(placa),
        });
      }
      const g = map.get(placa)!;
      g.abastecimentos.push(a);
      g.registros += 1;
      g.litros += this.toNum(a.quantidade_litros);
      g.valor += this.toNum(a.valor_total);
    }

    for (const g of map.values()) {
      const nomes = Array.from(new Set(
        g.abastecimentos
          .map(a => String(a.nome_proprietario || a.proprietario?.nome || '').trim())
          .filter(Boolean)
      ));
      g.proprietarios = nomes.length === 0 ? '—' : nomes.length <= 2 ? nomes.join(', ') : `${nomes.length} proprietários`;
      g.abastecimentos.sort((a, b) => String(b.data_hora ?? '').localeCompare(String(a.data_hora ?? '')));
    }

    return Array.from(map.values()).sort((a, b) => a.placa.localeCompare(b.placa));
  });

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.getAbastecimentos({ ...this.filters, per_page: 500 }).subscribe({
      next: r => {
        const lista = r.data ?? [];
        this.abastecimentos.set(lista);
        // Inicializa os campos editáveis sem sobrescrever o que o usuário já digitou
        for (const a of lista as any[]) {
          const id = a.id_abastecimento;
          if (!(id in this.kmInput)) this.kmInput[id] = a.odometro != null ? Number(a.odometro) : null;
          if (!(id in this.tripInput)) this.tripInput[id] = a.sofit_trip_id ?? '';
          if (!(id in this.dataHoraSofitInput)) this.dataHoraSofitInput[id] = this.toDateTimeLocal(a.data_hora);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toastr.error('Erro ao carregar abastecimentos');
      }
    });
  }

  clearFilters() {
    this.filters = { id_proprietario: '', placa: '', data_inicio: '', data_fim: '' };
    this.proprietarioBusca.set('');
    this.load();
  }

  toggleGrupo(placa: string) {
    const next = new Set(this.gruposExpandidos());
    next.has(placa) ? next.delete(placa) : next.add(placa);
    this.gruposExpandidos.set(next);
  }

  // ISO -> "YYYY-MM-DDTHH:mm" para o input datetime-local
  toDateTimeLocal(value: any): string {
    if (!value) return '';
    const s = String(value);
    if (s.length >= 16 && s[10] === 'T') return s.slice(0, 16);
    if (s.length >= 16) return s.slice(0, 10) + 'T' + s.slice(11, 16);
    if (s.length >= 10) return s.slice(0, 10) + 'T00:00';
    return s;
  }

  sofitStatus(a: any): string {
    return String(a?.sofit_status ?? '').toLowerCase();
  }

  sofitId(a: any): string {
    return String(a?.sofit_id ?? '');
  }

  sofitRetorno(a: any): string {
    return String(a?.sofit_retorno ?? '');
  }

  resumoSofitGrupo(grupo: GrupoPlaca): string {
    const lancados = grupo.abastecimentos.filter(a => this.sofitStatus(a) === 'lancado').length;
    return `Sofit: ${lancados}/${grupo.registros}`;
  }

  lancarNoSofit(a: any) {
    const id = a.id_abastecimento;
    if (!id || this.lancando().has(id)) return;

    const s = new Set(this.lancando());
    s.add(id);
    this.lancando.set(s);

    const kmRaw = this.kmInput[id];
    const odometro = kmRaw !== null && kmRaw !== undefined && String(kmRaw) !== '' ? Number(kmRaw) : null;
    const tripId = (this.tripInput[id] ?? '').trim() || null;
    const motoristaSofit = (this.motoristaSofitInput[id] ?? '').trim() || null;
    const dataHoraSofit = (this.dataHoraSofitInput[id] ?? '').trim() || null;

    this.api.lancarSofit(id, { trip_id: tripId, odometro, motorista_sofit: motoristaSofit, data_hora: dataHoraSofit }).subscribe({
      next: (r) => {
        this.atualizarSofitLocal(id, {
          sofit_status: r?.sofit_status ?? 'lancado',
          sofit_id: r?.sofit_id ?? null,
          sofit_retorno: r?.sofit_id ?? null,
          sofit_trip_id: tripId,
          ...(odometro !== null ? { odometro } : {}),
        });
        this.removerLancando(id);
        this.toastr.success(r?.message ?? 'Lançado no Sofit.');
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Erro ao lançar no Sofit';
        const status = err?.error?.sofit_status ?? 'erro';
        this.atualizarSofitLocal(id, {
          sofit_status: status,
          sofit_retorno: msg,
        });
        this.removerLancando(id);
        if (status === 'erro_motorista') {
          this.toastr.warning(msg);
        } else {
          this.toastr.error(msg);
        }
      },
    });
  }

  private removerLancando(id: string) {
    const s = new Set(this.lancando());
    s.delete(id);
    this.lancando.set(s);
  }

  private atualizarSofitLocal(id: string, patch: Record<string, any>) {
    this.abastecimentos.update(lista =>
      lista.map(item =>
        (item as any).id_abastecimento === id ? { ...item, ...patch } as any : item
      )
    );
  }

  onProprietarioBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.proprietarioBusca.set(value);
    this.showProprietariosDropdown.set(true);
    const exact = this.proprietarios().find((p) => this.normalizeText(p.nome) === this.normalizeText(value));
    this.filters.id_proprietario = exact?.id_proprietario ?? '';
    this.load();
  }

  selectProprietario(p: Proprietario | null) {
    this.filters.id_proprietario = p?.id_proprietario ?? '';
    this.proprietarioBusca.set(p?.nome ?? '');
    this.showProprietariosDropdown.set(false);
    this.load();
  }

  clearProprietario() {
    this.selectProprietario(null);
  }

  closeProprietariosDropdown() {
    setTimeout(() => this.showProprietariosDropdown.set(false), 120);
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  private toNum(v: unknown): number {
    const n = parseFloat(String(v ?? '0').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
}
