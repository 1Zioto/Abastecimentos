// src/app/features/portal-proprietario/portal-proprietario.component.ts
// Página pública (sem login): o proprietário acessa por link com token e
// consulta seus abastecimentos pendentes e os já baixados.
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-portal-proprietario',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="portal">
      <header class="portal-header">
        <div class="brand">
          <span class="brand-icon">⛽</span>
          <div>
            <h1>VIPE Transportes</h1>
            <p>Portal do Proprietário</p>
          </div>
        </div>
        @if (dados(); as d) {
          <div class="prop-nome">{{ d.proprietario?.nome }}</div>
        }
      </header>

      @if (loading()) {
        <div class="loading"><div class="spinner"></div> Carregando seus dados...</div>
      } @else if (erro()) {
        <div class="error-card">
          <span class="error-icon">🔒</span>
          <h2>Link inválido ou expirado</h2>
          <p>Entre em contato com a VIPE Transportes para receber um novo link de acesso.</p>
        </div>
      } @else if (dados(); as d) {
        <section class="resumo-grid">
          <div class="resumo-card destaque">
            <span class="resumo-label">Valor em aberto</span>
            <span class="resumo-valor">{{ d.resumo?.total_pendente | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>
          <div class="resumo-card">
            <span class="resumo-label">Abastecimentos pendentes</span>
            <span class="resumo-valor azul">{{ d.resumo?.qtd_pendentes }}</span>
          </div>
          <div class="resumo-card">
            <span class="resumo-label">Litros pendentes</span>
            <span class="resumo-valor azul">{{ d.resumo?.litros_pendentes | number:'1.2-2' }} L</span>
          </div>
        </section>

        <section class="bloco">
          <h2>⏳ Pendentes de pagamento ({{ d.pendentes?.length || 0 }})</h2>
          @if (!d.pendentes?.length) {
            <div class="vazio">🎉 Nenhum valor em aberto.</div>
          } @else {
            <div class="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Placa</th><th>Motorista</th>
                    <th class="dir">Litros</th><th class="dir">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of d.pendentes; track $index) {
                    <tr>
                      <td>{{ a.data | date:'dd/MM/yyyy' }}</td>
                      <td><span class="placa">{{ a.placa || '—' }}</span></td>
                      <td>{{ a.nome_motorista || '—' }}</td>
                      <td class="dir">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                      <td class="dir valor">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3"><strong>Total</strong></td>
                    <td class="dir"><strong>{{ d.resumo?.litros_pendentes | number:'1.2-2' }}</strong></td>
                    <td class="dir valor"><strong>{{ d.resumo?.total_pendente | currency:'BRL':'symbol':'1.2-2' }}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </section>

        <section class="bloco">
          <h2>✅ Pagamentos realizados (últimos {{ d.baixados?.length || 0 }})</h2>
          @if (!d.baixados?.length) {
            <div class="vazio">Nenhum pagamento registrado ainda.</div>
          } @else {
            <div class="tabela-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Abastecido em</th><th>Placa</th><th>Pago em</th>
                    <th class="dir">Litros</th><th class="dir">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of d.baixados; track $index) {
                    <tr>
                      <td>{{ a.data | date:'dd/MM/yyyy' }}</td>
                      <td><span class="placa">{{ a.placa || '—' }}</span></td>
                      <td>{{ a.data_baixa ? (a.data_baixa | date:'dd/MM/yyyy') : '—' }}</td>
                      <td class="dir">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                      <td class="dir pago">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <footer class="portal-footer">
          Atualizado em {{ d.gerado_em | date:'dd/MM/yyyy HH:mm' }} ·
          Dúvidas? Fale com a VIPE Transportes.
        </footer>
      }
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .portal { min-height: 100vh; background: #f1f5f9; font-family: 'Inter', sans-serif; color: #0f172a; padding: 0 0 32px; }
    .portal-header {
      background: #0d1427; color: #fff; padding: 18px 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { font-size: 30px; }
    .brand h1 { margin: 0; font-size: 18px; font-weight: 800; color: #fbcc04; }
    .brand p { margin: 2px 0 0; font-size: 12px; color: #94a3b8; }
    .prop-nome { font-size: 15px; font-weight: 700; color: #f8fafc; }

    .loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px 20px; color: #64748b; }
    .spinner { width: 22px; height: 22px; border: 3px solid #e2e8f0; border-top-color: #0ea5e9; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-card { max-width: 460px; margin: 60px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 28px; text-align: center; }
    .error-icon { font-size: 40px; }
    .error-card h2 { margin: 14px 0 8px; font-size: 18px; }
    .error-card p { margin: 0; color: #64748b; font-size: 13px; }

    .resumo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; max-width: 920px; margin: 18px auto 0; padding: 0 16px; }
    .resumo-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
    .resumo-card.destaque { border-color: #fca5a5; background: #fef2f2; }
    .resumo-label { display: block; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
    .resumo-valor { display: block; margin-top: 4px; font-size: 22px; font-weight: 800; color: #dc2626; }
    .resumo-valor.azul { color: #0284c7; }

    .bloco { max-width: 920px; margin: 18px auto 0; padding: 0 16px; }
    .bloco h2 { font-size: 15px; margin: 0 0 10px; color: #0f172a; }
    .vazio { background: #fff; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 22px; text-align: center; color: #64748b; font-size: 13px; }
    .tabela-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #64748b; border-bottom: 1px solid #e2e8f0; background: #f8fafc; white-space: nowrap; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    tfoot td { border-top: 2px solid #e2e8f0; background: #f8fafc; }
    .dir { text-align: right; }
    .placa { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 12px; }
    .valor { color: #dc2626; font-weight: 700; }
    .pago { color: #16a34a; font-weight: 700; }
    .portal-footer { max-width: 920px; margin: 24px auto 0; padding: 0 16px; text-align: center; color: #94a3b8; font-size: 12px; }
  `]
})
export class PortalProprietarioComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  erro = signal(false);
  dados = signal<any | null>(null);

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!token) {
      this.loading.set(false);
      this.erro.set(true);
      return;
    }
    this.api.getPortalProprietario(token).subscribe({
      next: (d) => {
        this.dados.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.loading.set(false);
      },
    });
  }
}
