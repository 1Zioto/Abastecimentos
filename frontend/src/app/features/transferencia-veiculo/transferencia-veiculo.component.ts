import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '../../core/services/api.service';
import { Proprietario, Veiculo } from '../../shared/models';

@Component({
  selector: 'app-transferencia-veiculo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <span class="eyebrow">Cadastros</span>
          <h1>Transferência de Veículo</h1>
          <p>Altere a titularidade atual do veículo sem mover abastecimentos antigos.</p>
        </div>
      </div>

      <section class="panel">
        <div class="grid">
          <label class="field">
            <span>Buscar veículo</span>
            <input
              type="text"
              [(ngModel)]="veiculoBusca"
              placeholder="Digite placa, marca ou modelo..."
            />
          </label>

          <label class="field">
            <span>Novo proprietário</span>
            <input
              type="text"
              [(ngModel)]="proprietarioBusca"
              placeholder="Digite o novo proprietário..."
            />
          </label>

          <label class="field">
            <span>Data da transferência</span>
            <input type="date" [(ngModel)]="dataTransferencia" />
          </label>
        </div>
      </section>

      <section class="columns">
        <div class="panel list-panel">
          <div class="section-title">
            <strong>Veículos</strong>
            <span>{{ veiculosFiltrados().length }} encontrados</span>
          </div>
          <div class="list">
            @for (v of veiculosFiltrados(); track v.id_veiculo) {
              <button
                type="button"
                class="list-item"
                [class.active]="veiculoSelecionado()?.id_veiculo === v.id_veiculo"
                (click)="selecionarVeiculo(v)"
              >
                <span class="placa">{{ v.placa }}</span>
                <span>{{ v.modelo || v.marca || 'Sem modelo' }}</span>
                <small>{{ v.proprietario?.nome || 'Sem proprietário' }}</small>
              </button>
            }
            @empty {
              <div class="empty">Nenhum veículo encontrado.</div>
            }
          </div>
        </div>

        <div class="panel list-panel">
          <div class="section-title">
            <strong>Proprietários</strong>
            <span>{{ proprietariosFiltrados().length }} encontrados</span>
          </div>
          <div class="list">
            @for (p of proprietariosFiltrados(); track p.id_proprietario) {
              <button
                type="button"
                class="list-item"
                [class.active]="novoProprietario()?.id_proprietario === p.id_proprietario"
                (click)="selecionarProprietario(p)"
              >
                <span>{{ p.nome }}</span>
                <small>{{ p.local || 'Filial não informada' }}</small>
              </button>
            }
            @empty {
              <div class="empty">Nenhum proprietário encontrado.</div>
            }
          </div>
        </div>
      </section>

      <section class="panel summary">
        <div>
          <span class="summary-label">Veículo</span>
          <strong>{{ veiculoSelecionado()?.placa || 'Selecione um veículo' }}</strong>
          <small>{{ veiculoSelecionado()?.proprietario?.nome || 'Proprietário atual não informado' }}</small>
        </div>
        <div>
          <span class="summary-label">Novo proprietário</span>
          <strong>{{ novoProprietario()?.nome || 'Selecione o novo proprietário' }}</strong>
          <small>{{ novoProprietario()?.local || 'Filial do novo proprietário' }}</small>
        </div>
        <label class="field obs">
          <span>Observação</span>
          <textarea [(ngModel)]="observacao" rows="3" placeholder="Ex.: venda, troca de titularidade, contrato..."></textarea>
        </label>
        <button class="btn-primary" type="button" [disabled]="!podeTransferir() || salvando()" (click)="transferir()">
          {{ salvando() ? 'Transferindo...' : 'Transferir titularidade' }}
        </button>
      </section>
    </div>
  `,
  styles: [`
    .page{padding:28px;color:#0f172a}
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
    .eyebrow{font-size:12px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
    h1{font-size:28px;margin:4px 0 6px}
    p{margin:0;color:#64748b}
    .panel{background:#fff;border:1px solid #dde5ef;border-radius:12px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.05)}
    .grid{display:grid;grid-template-columns:2fr 2fr 180px;gap:14px}
    .field{display:flex;flex-direction:column;gap:6px}
    .field span,.summary-label{font-size:12px;font-weight:800;color:#475569;text-transform:uppercase}
    input,textarea{border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;font-size:14px;color:#0f172a;background:#fff}
    textarea{resize:vertical}
    .columns{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .section-title span{font-size:12px;color:#64748b}
    .list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto}
    .list-item{display:grid;grid-template-columns:120px 1fr;gap:8px;text-align:left;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:10px 12px;cursor:pointer}
    .list-item small{grid-column:1 / -1;color:#64748b}
    .list-item.active{border-color:#0ea5e9;background:#e0f2fe}
    .placa{font-family:monospace;font-weight:800;color:#0369a1}
    .summary{display:grid;grid-template-columns:1fr 1fr 2fr auto;gap:14px;align-items:end;margin-top:16px}
    .summary strong{display:block;font-size:18px;margin-top:4px}
    .summary small{display:block;color:#64748b;margin-top:3px}
    .obs{min-width:260px}
    .btn-primary{border:none;border-radius:9px;background:#0284c7;color:#fff;font-weight:800;padding:12px 18px;cursor:pointer;white-space:nowrap}
    .btn-primary:disabled{opacity:.5;cursor:not-allowed}
    .empty{padding:20px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:10px}
    @media (max-width: 920px){.grid,.columns,.summary{grid-template-columns:1fr}.summary{align-items:stretch}}
  `]
})
export class TransferenciaVeiculoComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  veiculos = signal<Veiculo[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  veiculoSelecionado = signal<Veiculo | null>(null);
  novoProprietario = signal<Proprietario | null>(null);
  salvando = signal(false);

  veiculoBusca = '';
  proprietarioBusca = '';
  dataTransferencia = new Date().toISOString().slice(0, 10);
  observacao = '';

  veiculosFiltrados = computed(() => {
    const term = this.normalizar(this.veiculoBusca);
    const list = this.veiculos();
    if (!term) return list.slice(0, 80);
    return list.filter(v =>
      this.normalizar(v.placa).includes(term) ||
      this.normalizar(v.marca).includes(term) ||
      this.normalizar(v.modelo).includes(term) ||
      this.normalizar(v.proprietario?.nome).includes(term)
    ).slice(0, 80);
  });

  proprietariosFiltrados = computed(() => {
    const term = this.normalizar(this.proprietarioBusca);
    const list = this.proprietarios();
    if (!term) return list.slice(0, 80);
    return list.filter(p =>
      this.normalizar(p.nome).includes(term) ||
      this.normalizar(p.celular).includes(term) ||
      this.normalizar(p.local).includes(term)
    ).slice(0, 80);
  });

  ngOnInit() {
    this.api.getVeiculos({ per_page: 500 }).subscribe(r => this.veiculos.set(r.data ?? []));
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data ?? []));
  }

  selecionarVeiculo(v: Veiculo) {
    this.veiculoSelecionado.set(v);
    this.veiculoBusca = `${v.placa} ${v.modelo || v.marca || ''}`.trim();
  }

  selecionarProprietario(p: Proprietario) {
    this.novoProprietario.set(p);
    this.proprietarioBusca = p.nome;
  }

  podeTransferir() {
    const veiculo = this.veiculoSelecionado();
    const proprietario = this.novoProprietario();
    return !!veiculo?.id_veiculo &&
      !!proprietario?.id_proprietario &&
      veiculo.id_proprietario !== proprietario.id_proprietario;
  }

  transferir() {
    const veiculo = this.veiculoSelecionado();
    const proprietario = this.novoProprietario();
    if (!veiculo?.id_veiculo || !proprietario?.id_proprietario) return;

    this.salvando.set(true);
    this.api.transferirVeiculo(veiculo.id_veiculo, {
      id_proprietario: proprietario.id_proprietario,
      data_transferencia: this.dataTransferencia,
      observacao: this.observacao,
    }).subscribe({
      next: (resp) => {
        this.toastr.success(resp.message || 'Veículo transferido');
        const atualizado = resp.veiculo;
        this.veiculos.update(list => list.map(v => v.id_veiculo === atualizado.id_veiculo ? atualizado : v));
        this.veiculoSelecionado.set(atualizado);
        this.salvando.set(false);
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro ao transferir veículo');
        this.salvando.set(false);
      },
    });
  }

  private normalizar(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
  }
}
