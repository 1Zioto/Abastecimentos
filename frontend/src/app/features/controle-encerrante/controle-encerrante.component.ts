import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

type AnaliseEncerrante = {
  id_encerrante: string;
  data: string;
  local: string;
  quantidade_tanque: number;
  litros_bomba: number;
  foto?: string;
  usuario_nome?: string;
  anterior?: {
    data: string;
    quantidade_tanque: number;
    litros_bomba: number;
  };
  reset_detectado: boolean;
  delta_encerrante: number | null;
  saida_abastecimentos: number | null;
  entradas_combustivel: number | null;
  tanque_estimado: number | null;
  diferenca_encerrante_saida: number | null;
  diferenca_tanque: number | null;
  divergente: boolean;
};

@Component({
  selector: 'app-controle-encerrante',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="header">
        <div>
          <span class="eyebrow">Tela oculta</span>
          <h1>Controle privado do encerrante</h1>
          <p>
            Compara a virada do contador analógico, as saídas abastecidas e o tanque informado.
          </p>
        </div>
        <button type="button" class="primary-btn" (click)="load()" [disabled]="loading() || !canAccess()">
          {{ loading() ? 'Atualizando...' : 'Atualizar análise' }}
        </button>
      </header>

      @if (!canAccess()) {
        <section class="state error">Acesso restrito ao administrador autorizado.</section>
      } @else {
        <section class="filters">
          <label>
            Filial
            <select [(ngModel)]="local">
              <option value="Matriz">Matriz</option>
              <option value="Viana">Viana</option>
            </select>
          </label>
          <label>
            Data início
            <input type="date" [(ngModel)]="dataInicio" />
          </label>
          <label>
            Data fim
            <input type="date" [(ngModel)]="dataFim" />
          </label>
          <button type="button" class="secondary-btn" (click)="clearFilters()">Limpar</button>
        </section>

        <section class="logic-note">
          <strong>Regra do contador:</strong>
          se o encerrante atual for menor que o anterior, o sistema calcula
          <code>(100000 - anterior) + atual</code>.
        </section>

        @if (error()) {
          <section class="state error">{{ error() }}</section>
        } @else {
          <section class="summary">
            <article>
              <span>Registros analisados</span>
              <strong>{{ totalRegistros() }}</strong>
            </article>
            <article>
              <span>Divergências</span>
              <strong [class.warn]="totalDivergencias() > 0">{{ totalDivergencias() }}</strong>
            </article>
            <article>
              <span>Limite do encerrante</span>
              <strong>{{ limiteEncerrante() | number:'1.0-0' }}</strong>
            </article>
          </section>

          <section class="table-card">
            @if (loading()) {
              <div class="state">Carregando análise...</div>
            } @else if (items().length === 0) {
              <div class="state">Nenhum encerrante encontrado para esta filial.</div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Encerrante</th>
                      <th>Saída pelo contador</th>
                      <th>Saída abastecida</th>
                      <th>Diferença saída</th>
                      <th>Entradas</th>
                      <th>Tanque informado</th>
                      <th>Tanque estimado</th>
                      <th>Diferença tanque</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of items(); track item.id_encerrante) {
                      <tr [class.row-warn]="item.divergente">
                        <td>
                          <strong>{{ item.data | date:'dd/MM/yyyy' }}</strong>
                          <small>{{ item.usuario_nome || '-' }}</small>
                        </td>
                        <td>
                          <span>{{ item.anterior?.litros_bomba ?? '-' }}</span>
                          <strong>→ {{ item.litros_bomba | number:'1.2-2' }}</strong>
                          @if (item.reset_detectado) {
                            <em>virada detectada</em>
                          }
                        </td>
                        <td>{{ fmt(item.delta_encerrante) }}</td>
                        <td>{{ fmt(item.saida_abastecimentos) }}</td>
                        <td [class.bad]="abs(item.diferenca_encerrante_saida) > 0.5">
                          {{ fmt(item.diferenca_encerrante_saida) }}
                        </td>
                        <td>{{ fmt(item.entradas_combustivel) }}</td>
                        <td>{{ item.quantidade_tanque | number:'1.2-2' }} L</td>
                        <td>{{ fmt(item.tanque_estimado) }}</td>
                        <td [class.bad]="abs(item.diferenca_tanque) > 0.5">
                          {{ fmt(item.diferenca_tanque) }}
                        </td>
                        <td>
                          @if (!item.anterior) {
                            <span class="tag neutral">Base</span>
                          } @else if (item.divergente) {
                            <span class="tag warn">Verificar</span>
                          } @else {
                            <span class="tag ok">Ok</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .page {
      min-height: 100%;
      padding: 28px;
      background: #F3F4F6;
      color: #111827;
      font-family: 'Inter', sans-serif;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }

    .eyebrow {
      color: #B45309;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 4px 0 0;
      font-size: 28px;
      font-weight: 900;
    }

    p {
      margin: 6px 0 0;
      color: #64748B;
    }

    .filters,
    .logic-note,
    .summary article,
    .table-card,
    .state {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 12px;
      padding: 16px;
      margin-bottom: 12px;
    }

    label {
      display: grid;
      gap: 6px;
      color: #475569;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    input,
    select {
      height: 40px;
      min-width: 170px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 0 10px;
      background: #FFFFFF;
      color: #111827;
      font: inherit;
    }

    .primary-btn,
    .secondary-btn {
      height: 40px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      padding: 0 14px;
      background: #FFFFFF;
      color: #111827;
      font-weight: 900;
      cursor: pointer;
    }

    .primary-btn {
      background: #0284C7;
      border-color: #0284C7;
      color: #FFFFFF;
    }

    .primary-btn:disabled {
      opacity: 0.6;
      cursor: progress;
    }

    .logic-note {
      padding: 12px 14px;
      margin-bottom: 12px;
      color: #475569;
    }

    code {
      display: inline-block;
      background: #F1F5F9;
      border-radius: 6px;
      padding: 2px 6px;
      color: #0F172A;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary article {
      padding: 16px;
    }

    .summary span {
      display: block;
      color: #64748B;
      margin-bottom: 8px;
    }

    .summary strong {
      font-size: 24px;
      font-weight: 900;
    }

    .summary .warn {
      color: #EA580C;
    }

    .table-card {
      overflow: hidden;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      min-width: 1160px;
      border-collapse: collapse;
    }

    th {
      padding: 12px 14px;
      background: #F8FAFC;
      border-bottom: 1px solid #E5E7EB;
      text-align: left;
      color: #475569;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    td {
      padding: 14px;
      border-bottom: 1px solid #EEF2F7;
      vertical-align: top;
      font-weight: 700;
    }

    td small,
    td em {
      display: block;
      margin-top: 4px;
      color: #64748B;
      font-style: normal;
      font-weight: 600;
    }

    td em {
      color: #EA580C;
    }

    .row-warn {
      background: #FFF7ED;
    }

    .bad {
      color: #C2410C;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-radius: 999px;
      padding: 0 10px;
      font-size: 12px;
      font-weight: 900;
    }

    .tag.ok {
      background: #DCFCE7;
      color: #166534;
    }

    .tag.warn {
      background: #FFEDD5;
      color: #C2410C;
    }

    .tag.neutral {
      background: #E2E8F0;
      color: #334155;
    }

    .state {
      padding: 24px;
      color: #64748B;
      text-align: center;
    }

    .state.error {
      color: #B91C1C;
      background: #FEF2F2;
      border-color: #FECACA;
      margin-top: 16px;
    }

    @media (max-width: 760px) {
      .page {
        padding: 16px;
      }

      .header,
      .filters {
        flex-direction: column;
        align-items: stretch;
      }

      .primary-btn,
      .secondary-btn,
      input,
      select {
        width: 100%;
      }

      .summary {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ControleEncerranteComponent implements OnInit {
  loading = signal(false);
  error = signal('');
  items = signal<AnaliseEncerrante[]>([]);
  totalRegistros = signal(0);
  totalDivergencias = signal(0);
  limiteEncerrante = signal(100000);

  local = 'Matriz';
  dataInicio = '';
  dataFim = '';

  constructor(private api: ApiService, private auth: AuthService) {}

  ngOnInit(): void {
    this.local = this.auth.getGaragem() || 'Matriz';
    if (this.canAccess()) {
      this.load();
    }
  }

  canAccess(): boolean {
    const user = this.auth.currentUser();
    const ident = `${user?.login ?? ''} ${user?.nome ?? ''}`.toLowerCase();
    return user?.tipo === 'admin' && (ident.includes('douglas') || user?.login === 'admin');
  }

  load(): void {
    if (!this.canAccess()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.getAnalisePrivadaEncerranteBomba({
      local: this.local,
      data_inicio: this.dataInicio,
      data_fim: this.dataFim,
    }).subscribe({
      next: (resp) => {
        this.items.set(resp?.analises ?? []);
        this.totalRegistros.set(Number(resp?.total_registros ?? 0));
        this.totalDivergencias.set(Number(resp?.total_divergencias ?? 0));
        this.limiteEncerrante.set(Number(resp?.limite_encerrante ?? 100000));
        this.loading.set(false);
      },
      error: (err) => {
        this.items.set([]);
        this.error.set(err?.error?.message || 'Erro ao carregar análise do encerrante.');
        this.loading.set(false);
      },
    });
  }

  clearFilters(): void {
    this.dataInicio = '';
    this.dataFim = '';
    this.load();
  }

  fmt(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
  }

  abs(value: number | null | undefined): number {
    return Math.abs(Number(value ?? 0));
  }
}
