import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastrService } from 'ngx-toastr';

export interface NotificacaoLeitura {
  usuario_id?: string;
  usuario_nome: string;
  usuario_login?: string | null;
  dispositivo?: string | null;
  vista_em: string;
}

export interface NotificacaoCriticaItem {
  id: number;
  tipo: string;
  categoria: string;
  prioridade: 'critica' | 'alta' | string;
  titulo: string;
  mensagem: string;
  local?: string | null;
  tabela_origem?: string | null;
  registro_id?: string | null;
  autor_id?: string | null;
  autor_nome?: string | null;
  dados?: Record<string, any> | null;
  vista_em?: string | null;
  vista_por_id?: string | null;
  vista_por_nome?: string | null;
  vista_por_login?: string | null;
  vista_por_mim: boolean;
  minha_leitura_em?: string | null;
  leituras: NotificacaoLeitura[];
  created_at: string;
}

export interface StatusTanqueResumo {
  local: string;
  saldo_litros: number;
  entradas_litros: number;
  saidas_litros: number;
  zerado: boolean;
  critico: boolean;
}

@Component({
  selector: 'app-notificacoes-criticas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <!-- Cabeçalho -->
      <div class="page-header">
        <div>
          <div class="header-badge-row">
            <span class="admin-exclusive-pill">🔐 EXCLUSIVO ADMINISTRADOR</span>
            <span class="multi-branch-pill">🌐 Monitoramento Multi-Filial (Matriz + Viana)</span>
          </div>
          <h1>Central de Notificações Críticas</h1>
          <p>Alertas em tempo real de tanques, exclusões, edições sensíveis, encerrantes, baixas e integrações com rastreamento de leitura por administrador</p>
        </div>
        <div class="header-actions">
          <button
            class="btn-secondary"
            type="button"
            [disabled]="loading() || verificandoTanques()"
            (click)="verificarTanquesAgora()"
          >
            {{ verificandoTanques() ? 'Verificando tanques...' : '🛢 Verificar Tanques Agora' }}
          </button>
          <button
            class="btn-mark-all"
            type="button"
            [disabled]="loading() || marcandoTodas() || naoVistasCount() === 0"
            (click)="marcarTodasComoVistas()"
          >
            {{ marcandoTodas() ? 'Registrando...' : '✓ Marcar todas como vistas (' + naoVistasCount() + ')' }}
          </button>
          <button class="btn-primary" type="button" [disabled]="loading()" (click)="load()">
            {{ loading() ? 'Carregando...' : '↻ Atualizar' }}
          </button>
        </div>
      </div>

      <!-- Painel de KPIs + Status de Tanques Independente da Filial -->
      <section class="kpi-grid">
        <div class="kpi-card" [class.kpi-danger]="naoVistasCount() > 0" [class.kpi-ok]="naoVistasCount() === 0">
          <span class="kpi-label">Não vistas por mim</span>
          <strong class="kpi-value">{{ naoVistasCount() }}</strong>
          <span class="kpi-sub">
            {{ naoVistasCount() > 0 ? 'Pendentes de leitura no seu usuário' : 'Todas as notificações foram lidas por você' }}
          </span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Total de alertas no filtro</span>
          <strong class="kpi-value">{{ total() }}</strong>
          <span class="kpi-sub">Página {{ page() }} de {{ lastPage() }}</span>
        </div>

        @for (t of tanques(); track t.local) {
          <div
            class="kpi-card tank-card"
            [class.kpi-danger]="t.zerado"
            [class.kpi-warning]="!t.zerado && t.critico"
            [class.kpi-ok]="!t.zerado && !t.critico"
          >
            <div class="tank-card-top">
              <span class="kpi-label">Tanque {{ t.local }}</span>
              <span class="tank-status-pill" [class.zero]="t.zerado" [class.crit]="!t.zerado && t.critico" [class.ok]="!t.zerado && !t.critico">
                {{ t.zerado ? '🚨 ZERADO' : (t.critico ? '⚠ CRÍTICO (< 2.000 L)' : '✓ NORMAL') }}
              </span>
            </div>
            <strong class="kpi-value">{{ formatLitros(t.saldo_litros) }} L</strong>
            <span class="kpi-sub">
              Entradas: {{ formatLitros(t.entradas_litros) }} L • Saídas: {{ formatLitros(t.saidas_litros) }} L
            </span>
          </div>
        }
      </section>

      <!-- Filtros -->
      <section class="filters">
        <label>
          <span>Status de Leitura</span>
          <select [(ngModel)]="filters.status_leitura" (change)="resetAndLoad()">
            <option value="todas">Todas as notificações</option>
            <option value="nao_vistas">Não vistas por mim</option>
            <option value="vistas">Já vistas por mim</option>
          </select>
        </label>

        <label>
          <span>Categoria</span>
          <select [(ngModel)]="filters.categoria" (change)="resetAndLoad()">
            <option value="">Todas as categorias</option>
            <option value="abastecimentos">⛽ Abastecimentos</option>
            <option value="tanques_estoque">🛢 Tanques e Estoque</option>
            <option value="financeiro">💰 Financeiro e Baixas</option>
            <option value="cadastros_integracoes">🔐 Cadastros e Integrações</option>
          </select>
        </label>

        <label>
          <span>Filial</span>
          <select [(ngModel)]="filters.local" (change)="resetAndLoad()">
            <option value="">Todas (Matriz + Viana)</option>
            <option value="Matriz">Matriz</option>
            <option value="Viana">Viana</option>
            <option value="Geral">Geral / Sistema</option>
          </select>
        </label>

        <label>
          <span>Busca rápida (Placa, Código, Autor...)</span>
          <input
            type="text"
            [(ngModel)]="termoBusca"
            placeholder="Ex: Vipe-004507, placa, NF, autor..."
          />
        </label>

        <label>
          <span>Itens por página</span>
          <select [(ngModel)]="filters.per_page" (change)="resetAndLoad()">
            <option [ngValue]="25">25</option>
            <option [ngValue]="50">50</option>
            <option [ngValue]="100">100</option>
          </select>
        </label>
      </section>

      <!-- Lista de Notificações Críticas -->
      <div class="notifications-list">
        @for (item of itemsFiltrados(); track item.id) {
          <article
            class="notif-card"
            [class.unread]="!item.vista_por_mim"
            [class.priority-critica]="item.prioridade === 'critica'"
            [class.priority-alta]="item.prioridade !== 'critica'"
            (click)="abrirDetalhes(item)"
          >
            <div class="notif-left-bar"></div>
            <div class="notif-body">
              <div class="notif-top-row">
                <div class="notif-badges">
                  <span class="badge-prio" [class.critica]="item.prioridade === 'critica'" [class.alta]="item.prioridade !== 'critica'">
                    {{ item.prioridade === 'critica' ? '🚨 CRÍTICA' : '⚠ ALTA' }}
                  </span>
                  <span class="badge-cat">{{ categoriaLabel(item.categoria) }}</span>
                  @if (item.local) {
                    <span class="badge-local">📍 {{ item.local }}</span>
                  }
                  @if (!item.vista_por_mim) {
                    <span class="badge-unread">● NÃO VISTA POR VOCÊ</span>
                  } @else {
                    <span class="badge-read">✓ Vista por você em {{ item.minha_leitura_em | date:'dd/MM/yyyy HH:mm' }}</span>
                  }
                </div>
                <span class="notif-date">{{ item.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</span>
              </div>

              <h3 class="notif-title">{{ item.titulo }}</h3>
              <p class="notif-msg">{{ item.mensagem }}</p>

              <div class="notif-footer">
                <div class="notif-meta">
                  <span><strong>Origem:</strong> {{ item.autor_nome || 'Sistema' }}</span>
                  @if (item.tabela_origem) {
                    <span>• <strong>Tabela:</strong> <code>{{ item.tabela_origem }}</code></span>
                  }
                  @if (item.registro_id) {
                    <span>• <strong>ID:</strong> <code>{{ item.registro_id }}</code></span>
                  }
                </div>

                <!-- Registro de quem viu e quando -->
                <div class="notif-readers" (click)="$event.stopPropagation()">
                  @if (item.leituras && item.leituras.length > 0) {
                    <div class="readers-chips">
                      <span class="readers-label">👁 Visto por:</span>
                      @for (l of item.leituras; track $index) {
                        <span class="reader-chip" [title]="(l.dispositivo || 'App/Web') + ' • Login: ' + (l.usuario_login || l.usuario_nome)">
                          <strong>{{ l.usuario_nome }}</strong>
                          <small>({{ l.vista_em | date:'dd/MM HH:mm' }} • {{ l.dispositivo || 'APK' }})</small>
                        </span>
                      }
                    </div>
                  } @else if (item.vista_em) {
                    <div class="readers-chips">
                      <span class="readers-label">👁 Visto por:</span>
                      <span class="reader-chip">
                        <strong>{{ item.vista_por_nome || item.vista_por_login || 'Admin' }}</strong>
                        <small>({{ item.vista_em | date:'dd/MM HH:mm' }})</small>
                      </span>
                    </div>
                  } @else {
                    <span class="no-readers">Ainda não visualizada por nenhum administrador</span>
                  }

                  <div class="card-actions">
                    @if (!item.vista_por_mim) {
                      <button
                        type="button"
                        class="btn-mark-one"
                        (click)="marcarUmaComoVista(item, $event)"
                      >
                        ✓ Marcar como vista
                      </button>
                    }
                    <button
                      type="button"
                      class="btn-details"
                      (click)="abrirDetalhes(item)"
                    >
                      Detalhes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </article>
        } @empty {
          <div class="empty-state">
            <div class="empty-icon">🔔</div>
            <h3>Nenhuma notificação crítica encontrada</h3>
            <p>Não há alertas para os filtros selecionados no momento.</p>
          </div>
        }
      </div>

      <!-- Paginação -->
      <div class="pager">
        <button class="btn-secondary" [disabled]="page() <= 1 || loading()" (click)="go(page() - 1)">Anterior</button>
        <span class="pager-info">Página {{ page() }} de {{ lastPage() }}</span>
        <button class="btn-secondary" [disabled]="page() >= lastPage() || loading()" (click)="go(page() + 1)">Próxima</button>
      </div>
    </div>

    <!-- Modal de Detalhes e Auditoria de Visualizações -->
    @if (selecionada(); as sel) {
      <div class="modal-backdrop" (click)="fecharDetalhes()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <div class="notif-badges">
                <span class="badge-prio" [class.critica]="sel.prioridade === 'critica'" [class.alta]="sel.prioridade !== 'critica'">
                  {{ sel.prioridade === 'critica' ? '🚨 PRIORIDADE CRÍTICA' : '⚠ PRIORIDADE ALTA' }}
                </span>
                <span class="badge-cat">{{ categoriaLabel(sel.categoria) }}</span>
                @if (sel.local) {
                  <span class="badge-local">📍 Filial {{ sel.local }}</span>
                }
              </div>
              <h2>{{ sel.titulo }}</h2>
            </div>
            <button type="button" class="modal-close" (click)="fecharDetalhes()">✕</button>
          </div>

          <div class="modal-body">
            <div class="detail-box">
              <p class="detail-message">{{ sel.mensagem }}</p>
              <div class="detail-grid">
                <div>
                  <span class="detail-label">Data/Hora do Evento</span>
                  <strong>{{ sel.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</strong>
                </div>
                <div>
                  <span class="detail-label">Autor / Origem</span>
                  <strong>{{ sel.autor_nome || 'Sistema' }}</strong>
                </div>
                <div>
                  <span class="detail-label">Código do Tipo</span>
                  <code>{{ sel.tipo }}</code>
                </div>
                <div>
                  <span class="detail-label">Referência</span>
                  <code>{{ (sel.tabela_origem || '-') + ' / ' + (sel.registro_id || '-') }}</code>
                </div>
              </div>
            </div>

            <!-- Auditoria de Leituras -->
            <div class="section-block">
              <h4>👁 Registro de Visualização (Quem viu e quando)</h4>
              @if (sel.leituras && sel.leituras.length > 0) {
                <table class="readers-table">
                  <thead>
                    <tr>
                      <th>Administrador</th>
                      <th>Login</th>
                      <th>Data e Horário da Visualização</th>
                      <th>Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of sel.leituras; track $index) {
                      <tr>
                        <td><strong>{{ l.usuario_nome }}</strong></td>
                        <td><code>{{ l.usuario_login || '-' }}</code></td>
                        <td>{{ l.vista_em | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                        <td>{{ l.dispositivo || 'APK / Web' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted">Nenhuma leitura registrada ainda.</p>
              }
            </div>

            <!-- Dados Técnicos JSON -->
            @if (sel.dados && hasKeys(sel.dados)) {
              <div class="section-block">
                <h4>📋 Dados Técnicos do Evento</h4>
                <pre class="json-box">{{ formatJson(sel.dados) }}</pre>
              </div>
            }
          </div>

          <div class="modal-footer">
            @if (!sel.vista_por_mim) {
              <button type="button" class="btn-mark-all" (click)="marcarUmaComoVista(sel)">
                ✓ Confirmar Leitura Agora
              </button>
            }
            <button type="button" class="btn-secondary" (click)="fecharDetalhes()">Fechar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { padding: 28px; max-width: 1440px; margin: 0 auto; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .header-badge-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
    .admin-exclusive-pill {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 999px;
      background: #FEE2E2; color: #991B1B;
      font-size: 11px; font-weight: 800; letter-spacing: 0.4px;
    }
    .multi-branch-pill {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 999px;
      background: #DBEAFE; color: #1E40AF;
      font-size: 11px; font-weight: 800; letter-spacing: 0.3px;
    }
    h1 { margin: 0; color: #111827; font-size: 26px; font-weight: 800; }
    .page-header p { margin: 6px 0 0; color: #6B7280; font-size: 14px; max-width: 780px; }
    .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .kpi-card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 16px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
    }
    .kpi-card.kpi-danger {
      border-color: #FCA5A5;
      background: linear-gradient(180deg, #FEF2F2 0%, #FFFFFF 100%);
    }
    .kpi-card.kpi-warning {
      border-color: #FCD34D;
      background: linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 100%);
    }
    .kpi-card.kpi-ok {
      border-color: #A7F3D0;
      background: linear-gradient(180deg, #ECFDF5 0%, #FFFFFF 100%);
    }
    .kpi-label { color: #64748B; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    .kpi-value { color: #0F172A; font-size: 26px; font-weight: 800; line-height: 1.15; }
    .kpi-danger .kpi-value { color: #DC2626; }
    .kpi-warning .kpi-value { color: #D97706; }
    .kpi-ok .kpi-value { color: #059669; }
    .kpi-sub { color: #64748B; font-size: 12px; }
    .tank-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .tank-status-pill {
      padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 800;
    }
    .tank-status-pill.zero { background: #DC2626; color: #FFFFFF; }
    .tank-status-pill.crit { background: #F59E0B; color: #FFFFFF; }
    .tank-status-pill.ok { background: #10B981; color: #FFFFFF; }

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 18px;
    }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 700; color: #374151; }
    input, select {
      height: 40px; border: 1px solid #D1D5DB; border-radius: 10px;
      padding: 0 12px; font-size: 13px; background: #FFFFFF; color: #111827;
    }

    .notifications-list { display: flex; flex-direction: column; gap: 12px; }
    .notif-card {
      display: flex;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 16px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .notif-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
      border-color: #CBD5E1;
    }
    .notif-card.unread {
      border-color: #FCA5A5;
      background: #FFFDFD;
      box-shadow: 0 4px 14px rgba(220, 38, 38, 0.07);
    }
    .notif-left-bar { width: 6px; flex-shrink: 0; background: #F59E0B; }
    .notif-card.priority-critica .notif-left-bar { background: #DC2626; }
    .notif-body { flex: 1; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .notif-top-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .notif-badges { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .badge-prio {
      padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
    }
    .badge-prio.critica { background: #FEE2E2; color: #991B1B; }
    .badge-prio.alta { background: #FEF3C7; color: #92400E; }

    .badge-cat {
      padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      background: #F1F5F9; color: #334155;
    }
    .badge-local {
      padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      background: #EFF6FF; color: #1D4ED8;
    }
    .badge-unread {
      padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800;
      background: #DC2626; color: #FFFFFF;
    }
    .badge-read {
      padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      background: #DCFCE7; color: #166534;
    }
    .notif-date { color: #64748B; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .notif-title { margin: 2px 0 0; font-size: 16px; font-weight: 800; color: #0F172A; }
    .notif-msg { margin: 0; font-size: 14px; color: #334155; line-height: 1.45; }

    .notif-footer {
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px; padding-top: 10px; margin-top: 4px;
      border-top: 1px dashed #E2E8F0; flex-wrap: wrap;
    }
    .notif-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748B; flex-wrap: wrap; }
    .notif-readers { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .readers-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .readers-label { font-size: 12px; font-weight: 700; color: #475569; }
    .reader-chip {
      display: inline-flex; align-items: center; gap: 5px;
      background: #F8FAFC; border: 1px solid #E2E8F0;
      padding: 3px 9px; border-radius: 999px; font-size: 11px; color: #1E293B;
    }
    .reader-chip small { color: #64748B; }
    .no-readers { font-size: 12px; color: #DC2626; font-weight: 600; }
    .card-actions { display: flex; gap: 8px; align-items: center; }

    .btn-primary, .btn-secondary, .btn-mark-all, .btn-mark-one, .btn-details {
      height: 38px; border-radius: 10px; padding: 0 14px; font-weight: 700; font-size: 13px; cursor: pointer; border: none;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .btn-primary { background: #F5C400; color: #111827; }
    .btn-secondary { background: #FFFFFF; color: #111827; border: 1px solid #D1D5DB; }
    .btn-mark-all { background: #DC2626; color: #FFFFFF; }
    .btn-mark-one { height: 32px; padding: 0 10px; font-size: 12px; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
    .btn-details { height: 32px; padding: 0 10px; font-size: 12px; background: #F8FAFC; color: #334155; border: 1px solid #E2E8F0; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .empty-state {
      background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px;
      padding: 48px 20px; text-align: center; color: #64748B;
    }
    .empty-icon { font-size: 36px; margin-bottom: 8px; }
    .empty-state h3 { margin: 0 0 6px; color: #111827; }
    .empty-state p { margin: 0; font-size: 14px; }

    .pager { display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-top: 16px; }
    .pager-info { font-size: 13px; font-weight: 700; color: #475569; }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(15, 23, 42, 0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .modal-card {
      background: #FFFFFF; border-radius: 20px; width: 100%; max-width: 760px;
      max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);
    }
    .modal-header {
      padding: 20px 24px; border-bottom: 1px solid #E5E7EB;
      display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    }
    .modal-header h2 { margin: 10px 0 0; font-size: 20px; color: #0F172A; }
    .modal-close {
      background: #F1F5F9; border: none; width: 34px; height: 34px;
      border-radius: 50%; cursor: pointer; font-size: 16px; color: #475569;
    }
    .modal-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
    .detail-box {
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 16px;
    }
    .detail-message { margin: 0 0 14px; font-size: 15px; color: #1E293B; line-height: 1.5; font-weight: 600; }
    .detail-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;
    }
    .detail-label { display: block; font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
    .section-block h4 { margin: 0 0 10px; font-size: 14px; color: #0F172A; }
    .readers-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .readers-table th, .readers-table td {
      padding: 10px 12px; border-bottom: 1px solid #E2E8F0; text-align: left;
    }
    .readers-table th { background: #F1F5F9; font-size: 11px; text-transform: uppercase; color: #475569; }
    .json-box {
      margin: 0; padding: 14px; background: #0F172A; color: #E2E8F0;
      border-radius: 12px; font-size: 12px; overflow-x: auto;
    }
    .modal-footer {
      padding: 14px 24px; border-top: 1px solid #E5E7EB;
      display: flex; justify-content: flex-end; gap: 10px; background: #F8FAFC;
    }
    code { background: #F1F5F9; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
  `],
})
export class NotificacoesCriticasComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);

  items = signal<NotificacaoCriticaItem[]>([]);
  tanques = signal<StatusTanqueResumo[]>([]);
  loading = signal(false);
  verificandoTanques = signal(false);
  marcandoTodas = signal(false);
  page = signal(1);
  lastPage = signal(1);
  total = signal(0);
  naoVistasCount = signal(0);
  selecionada = signal<NotificacaoCriticaItem | null>(null);
  termoBusca = '';

  filters = {
    status_leitura: 'todas',
    categoria: '',
    local: '',
    per_page: 50,
  };

  itemsFiltrados = computed(() => {
    const lista = this.items();
    const q = this.termoBusca.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(item =>
      (item.titulo || '').toLowerCase().includes(q) ||
      (item.mensagem || '').toLowerCase().includes(q) ||
      (item.autor_nome || '').toLowerCase().includes(q) ||
      (item.registro_id || '').toLowerCase().includes(q) ||
      (item.local || '').toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.load();
    this.carregarResumoTanques(false);
  }

  resetAndLoad(): void {
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.listarNotificacoesCriticas({
      ...this.filters,
      page: this.page(),
    }).subscribe({
      next: (res: any) => {
        this.items.set(res?.data ?? []);
        this.page.set(res?.current_page ?? 1);
        this.lastPage.set(res?.last_page ?? 1);
        this.total.set(res?.total ?? 0);
        if (typeof res?.nao_vistas_count === 'number') {
          this.naoVistasCount.set(res.nao_vistas_count);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toastr.error(err?.error?.message || 'Erro ao carregar notificações críticas');
      },
    });
  }

  carregarResumoTanques(checkTanques: boolean): void {
    if (checkTanques) {
      this.verificandoTanques.set(true);
    }
    this.api.resumoNotificacoesCriticas({ check_tanques: checkTanques ? 1 : 0 }).subscribe({
      next: (res: any) => {
        if (Array.isArray(res?.tanques)) {
          this.tanques.set(res.tanques);
        }
        if (typeof res?.nao_vistas_count === 'number') {
          this.naoVistasCount.set(res.nao_vistas_count);
        }
        if (checkTanques) {
          this.verificandoTanques.set(false);
          this.toastr.success('Saldos dos tanques (Matriz e Viana) verificados com sucesso.');
          this.load();
        }
      },
      error: () => {
        this.verificandoTanques.set(false);
      },
    });
  }

  verificarTanquesAgora(): void {
    this.carregarResumoTanques(true);
  }

  marcarUmaComoVista(item: NotificacaoCriticaItem, event?: Event): void {
    event?.stopPropagation();
    if (!item?.id || item.vista_por_mim) return;

    this.api.marcarNotificacaoCriticaVista(item.id, 'Web Admin').subscribe({
      next: (res: any) => {
        const vistaEm = res?.vista_em || new Date().toISOString();
        const user = this.auth.currentUser();
        const meuNome = user?.nome || user?.login || 'Administrador';
        const meuLogin = user?.login || meuNome;

        this.items.update(lista =>
          lista.map(it => {
            if (it.id !== item.id) return it;
            const novasLeituras: NotificacaoLeitura[] = [
              ...(it.leituras || []),
              {
                usuario_nome: meuNome,
                usuario_login: meuLogin,
                dispositivo: 'Web Admin',
                vista_em: vistaEm,
              },
            ];
            const atualizado: NotificacaoCriticaItem = {
              ...it,
              vista_por_mim: true,
              minha_leitura_em: vistaEm,
              vista_em: it.vista_em || vistaEm,
              vista_por_nome: it.vista_por_nome || meuNome,
              leituras: novasLeituras,
            };
            if (this.selecionada()?.id === item.id) {
              this.selecionada.set(atualizado);
            }
            return atualizado;
          })
        );
        this.naoVistasCount.update(c => Math.max(0, c - 1));
      },
      error: () => {
        this.toastr.error('Não foi possível registrar a leitura da notificação.');
      },
    });
  }

  marcarTodasComoVistas(): void {
    if (this.marcandoTodas() || this.naoVistasCount() === 0) return;
    this.marcandoTodas.set(true);
    this.api.marcarNotificacoesCriticasVistasLote({ todas: true, dispositivo: 'Web Admin' }).subscribe({
      next: () => {
        this.marcandoTodas.set(false);
        this.toastr.success('Todas as notificações críticas foram marcadas como vistas.');
        this.load();
      },
      error: () => {
        this.marcandoTodas.set(false);
        this.toastr.error('Erro ao marcar todas como vistas.');
      },
    });
  }

  abrirDetalhes(item: NotificacaoCriticaItem): void {
    this.selecionada.set(item);
    if (!item.vista_por_mim) {
      this.marcarUmaComoVista(item);
    }
  }

  fecharDetalhes(): void {
    this.selecionada.set(null);
  }

  go(nextPage: number): void {
    this.page.set(nextPage);
    this.load();
  }

  categoriaLabel(cat: string): string {
    switch (cat) {
      case 'abastecimentos': return '⛽ Abastecimentos';
      case 'tanques_estoque': return '🛢 Tanques e Estoque';
      case 'financeiro': return '💰 Financeiro e Baixas';
      case 'cadastros_integracoes': return '🔐 Cadastros e Integrações';
      default: return cat || 'Geral';
    }
  }

  formatLitros(val: number | null | undefined): string {
    return Number(val ?? 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  hasKeys(obj?: Record<string, any> | null): boolean {
    return !!obj && Object.keys(obj).length > 0;
  }

  formatJson(obj: any): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }
}

