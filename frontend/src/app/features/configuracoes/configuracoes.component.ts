import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Configurações</h1>
          <p>Preferências do sistema</p>
        </div>
      </header>

      <section class="settings-panel">
        <div class="setting-copy">
          <h2>Análise do comprovante</h2>
          <p>{{ useAiAnalysis() ? 'IA ativada para todos os dispositivos.' : 'OCR local ativado para todos os dispositivos.' }}</p>
          <p *ngIf="!isAdmin()" class="muted">Somente administradores podem alterar esta configuração.</p>
        </div>
        <label class="switch">
          <input type="checkbox" [checked]="useAiAnalysis()" [disabled]="!isAdmin() || savingAnalysis()" (change)="setUseAiAnalysis($any($event.target).checked)" />
          <span></span>
        </label>
      </section>

      <section class="settings-panel settings-panel-block">
        <div class="setting-copy">
          <h2>Orientação da IA</h2>
          <p>Texto usado para orientar a leitura de fotos de bomba, recibos e comprovantes.</p>
        </div>
        <textarea
          class="orientation-input"
          [(ngModel)]="aiOrientation"
          rows="7"
          spellcheck="false"
          [disabled]="!isAdmin() || savingAnalysis()"
        ></textarea>
        <div class="orientation-actions">
          <button type="button" class="btn-secondary" (click)="restoreDefaultAiOrientation()" [disabled]="!isAdmin() || savingAnalysis()">Restaurar padrão</button>
          <button type="button" (click)="saveAiOrientation()" [disabled]="!isAdmin() || savingAnalysis()">Salvar orientação</button>
        </div>
      </section>

      <section class="settings-panel settings-panel-block">
        <div class="setting-copy">
          <h2>Prompt da nota fiscal</h2>
          <p>Texto usado para decidir se o anexo da entrada parece uma nota fiscal ou documento fiscal.</p>
        </div>
        <textarea
          class="orientation-input"
          [(ngModel)]="notaFiscalPrompt"
          rows="7"
          spellcheck="false"
          [disabled]="!isAdmin() || savingAnalysis()"
        ></textarea>
        <div class="orientation-actions">
          <button type="button" class="btn-secondary" (click)="restoreDefaultNotaFiscalPrompt()" [disabled]="!isAdmin() || savingAnalysis()">Restaurar padrão</button>
          <button type="button" (click)="saveNotaFiscalPrompt()" [disabled]="!isAdmin() || savingAnalysis()">Salvar prompt da nota</button>
        </div>
      </section>

      <section class="settings-panel">
        <div class="setting-copy">
          <h2>Encerrante da bomba</h2>
          <p>Horário semanal obrigatório para operadores informarem o encerrante antes de novos abastecimentos.</p>
          <p *ngIf="!isAdmin()" class="muted">Somente administradores podem alterar este horário.</p>
          <p *ngIf="message()" class="message">{{ message() }}</p>
        </div>
        <div class="time-config">
          <label>
            Horário
            <input type="time" [(ngModel)]="encerranteHora" [disabled]="!isAdmin() || saving()" />
          </label>
          <button type="button" (click)="saveEncerranteHora()" [disabled]="!isAdmin() || saving()">
            {{ saving() ? 'Salvando...' : 'Salvar' }}
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .page {
      padding: 28px;
      min-height: 100%;
      background: #F3F4F6;
      color: #111827;
      font-family: 'Inter', sans-serif;
    }

    .page-header {
      margin-bottom: 20px;
    }

    .page-header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
    }

    .page-header p {
      margin: 6px 0 0;
      color: #64748B;
      font-size: 14px;
    }

    .settings-panel {
      max-width: 760px;
      margin-bottom: 14px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
    }

    .settings-panel-block {
      align-items: stretch;
      flex-direction: column;
    }

    .setting-copy h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
    }

    .setting-copy p {
      margin: 6px 0 0;
      color: #64748B;
      font-size: 13px;
    }

    .setting-copy .muted {
      color: #94A3B8;
    }

    .setting-copy .message {
      color: #0284C7;
      font-weight: 700;
    }

    .time-config {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      flex: 0 0 auto;
    }

    .time-config label {
      display: grid;
      gap: 6px;
      color: #475569;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .time-config input {
      width: 132px;
      height: 40px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 0 10px;
      font: inherit;
      color: #111827;
      background: #FFFFFF;
    }

    .time-config button {
      height: 40px;
      border: 0;
      border-radius: 8px;
      padding: 0 16px;
      background: #0EA5E9;
      color: #FFFFFF;
      font-weight: 800;
      cursor: pointer;
    }

    .orientation-input {
      width: 100%;
      min-height: 150px;
      resize: vertical;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 12px;
      color: #111827;
      background: #FFFFFF;
      font: 13px/1.45 'Inter', sans-serif;
    }

    .orientation-input:focus {
      outline: none;
      border-color: #0EA5E9;
      box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
    }

    .orientation-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .orientation-actions button {
      height: 40px;
      border: 0;
      border-radius: 8px;
      padding: 0 16px;
      background: #0EA5E9;
      color: #FFFFFF;
      font-weight: 800;
      cursor: pointer;
    }

    .orientation-actions .btn-secondary {
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #475569;
    }

    .time-config button:disabled,
    .time-config input:disabled,
    .orientation-actions button:disabled,
    .orientation-input:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    @media (max-width: 720px) {
      .settings-panel {
        align-items: stretch;
        flex-direction: column;
      }

      .time-config {
        align-items: stretch;
      }
    }

    .switch {
      position: relative;
      width: 58px;
      height: 34px;
      flex: 0 0 auto;
      cursor: pointer;
    }

    .switch input {
      position: absolute;
      opacity: 0;
    }

    .switch span {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: #CBD5E1;
      transition: background 0.2s;
    }

    .switch span::after {
      content: '';
      position: absolute;
      width: 26px;
      height: 26px;
      top: 4px;
      left: 4px;
      border-radius: 50%;
      background: #FFFFFF;
      transition: transform 0.2s;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.25);
    }

    .switch input:checked + span {
      background: #0EA5E9;
    }

    .switch input:checked + span::after {
      transform: translateX(24px);
    }
  `]
})
export class ConfiguracoesComponent implements OnInit {
  private readonly aiOrientationKey = 'abastecimento-ai-orientation';
  private readonly notaFiscalPromptKey = 'nota-fiscal-ai-prompt';
  private readonly defaultAiOrientation = [
    'Se nada for encontrado, tente encontrar na imagem a quantidade em litros.',
    'Primeiro classifique a imagem: bomba/medidor mecânico, recibo/papel, odômetro ou outro.',
    'Regra geral: compare apenas dados visíveis e legíveis. Não invente placa, preço por litro, valor total ou odômetro ausentes.',
    'Se for bomba/medidor, compare principalmente litros/volume. Em bombas antigas, "TOTAL" pode indicar volume totalizado, não valor em reais. Considere imagem girada, cortada, empoeirada ou com visor lateral. Leia os dígitos mesmo tortos. Se o visor mostrar número sem vírgula compatível com 1 decimal implícito, normalize. Ex.: 6132 = 613,2 L.',
    'Se for recibo/papel, compare LT/litros, R$/valor total, placa e odômetro somente quando legíveis. Compare preço unitário apenas se ele aparecer explicitamente.',
    'Se um recibo/papel estiver anexado no campo da bomba, não marque erro por isso; use os campos legíveis para validar o abastecimento.',
  ].join('\n');
  private readonly defaultNotaFiscalPrompt = [
    'Classifique a imagem enviada no campo de nota fiscal.',
    'Ela deve parecer uma nota fiscal, DANFE, comprovante fiscal, documento de entrada de combustível ou imagem legível de documento fiscal.',
    'Considere fotos giradas, cortadas, com sombra ou baixa qualidade, desde que exista estrutura de documento fiscal ou dados fiscais legíveis.',
    'Retorne como válida se houver indícios claros de documento fiscal: número da nota, emitente/destinatário, chave de acesso, DANFE, NF-e, valores, data, produtos ou quantidade.',
    'Retorne como suspeita se a imagem for tela preta, foto sem documento, bomba de combustível, odômetro, recibo manuscrito simples, selfie, paisagem, imagem vazia ou qualquer arquivo que não pareça nota/documento fiscal.',
    'Não exija que todos os campos estejam legíveis; o objetivo principal é validar se a imagem parece uma nota fiscal ou documento fiscal de entrada.',
  ].join('\n');

  useAiAnalysis = signal(localStorage.getItem('abastecimento-analysis-engine') === 'ai');
  saving = signal(false);
  savingAnalysis = signal(false);
  message = signal('');
  encerranteHora = '08:00';
  aiOrientation = localStorage.getItem(this.aiOrientationKey) || this.defaultAiOrientation;
  notaFiscalPrompt = localStorage.getItem(this.notaFiscalPromptKey) || this.defaultNotaFiscalPrompt;

  constructor(private api: ApiService, private auth: AuthService) {}

  ngOnInit() {
    this.loadAnalysisConfig();
    this.api.getEncerranteBombaConfig().subscribe({
      next: res => this.encerranteHora = res?.hora_obrigatoria || '08:00',
      error: () => this.message.set('Não foi possível carregar a configuração do encerrante.')
    });
  }

  isAdmin() {
    return this.auth.isAdmin();
  }

  loadAnalysisConfig() {
    this.api.getAbastecimentoAnaliseConfig().subscribe({
      next: res => this.applyAnalysisConfig(res),
      error: () => this.message.set('Não foi possível carregar a configuração da análise.')
    });
  }

  setUseAiAnalysis(value: boolean) {
    if (!this.isAdmin()) return;
    this.saveAnalysisConfig(value ? 'ai' : 'ocr', this.aiOrientation);
  }

  saveAiOrientation() {
    if (!this.isAdmin()) return;
    this.saveAnalysisConfig(this.useAiAnalysis() ? 'ai' : 'ocr', this.aiOrientation.trim() || this.defaultAiOrientation);
  }

  restoreDefaultAiOrientation() {
    this.aiOrientation = this.defaultAiOrientation;
    this.saveAiOrientation();
  }

  saveNotaFiscalPrompt() {
    if (!this.isAdmin()) return;
    this.saveAnalysisConfig(
      this.useAiAnalysis() ? 'ai' : 'ocr',
      this.aiOrientation.trim() || this.defaultAiOrientation,
      this.notaFiscalPrompt.trim() || this.defaultNotaFiscalPrompt,
    );
  }

  restoreDefaultNotaFiscalPrompt() {
    this.notaFiscalPrompt = this.defaultNotaFiscalPrompt;
    this.saveNotaFiscalPrompt();
  }

  private saveAnalysisConfig(engine: 'ai' | 'ocr', orientation: string, notaFiscalPrompt = this.notaFiscalPrompt) {
    this.savingAnalysis.set(true);
    this.message.set('');
    this.api.updateAbastecimentoAnaliseConfig({
      analysis_engine: engine,
      ai_orientation: orientation,
      nota_fiscal_ai_prompt: notaFiscalPrompt,
    }).subscribe({
      next: res => {
        this.applyAnalysisConfig(res);
        this.message.set('Configuração de análise salva para todos os dispositivos.');
        this.savingAnalysis.set(false);
      },
      error: err => {
        this.message.set(err?.error?.message || 'Erro ao salvar a configuração de análise.');
        this.savingAnalysis.set(false);
      }
    });
  }

  private applyAnalysisConfig(res: { analysis_engine?: 'ai' | 'ocr'; use_ai_analysis?: boolean; ai_orientation?: string; nota_fiscal_ai_prompt?: string }) {
    const engine = res?.analysis_engine === 'ocr' ? 'ocr' : 'ai';
    this.useAiAnalysis.set(engine === 'ai');
    this.aiOrientation = (res?.ai_orientation || '').trim() || this.defaultAiOrientation;
    this.notaFiscalPrompt = (res?.nota_fiscal_ai_prompt || '').trim() || this.defaultNotaFiscalPrompt;
    localStorage.setItem('abastecimento-analysis-engine', engine);
    localStorage.setItem(this.aiOrientationKey, this.aiOrientation);
    localStorage.setItem(this.notaFiscalPromptKey, this.notaFiscalPrompt);
  }

  saveEncerranteHora() {
    if (!this.isAdmin()) return;
    this.saving.set(true);
    this.message.set('');
    this.api.updateEncerranteBombaConfig({ hora_obrigatoria: this.encerranteHora }).subscribe({
      next: res => {
        this.encerranteHora = res?.hora_obrigatoria || this.encerranteHora;
        this.message.set('Horário salvo com sucesso.');
        this.saving.set(false);
      },
      error: err => {
        this.message.set(err?.error?.message || 'Erro ao salvar o horário.');
        this.saving.set(false);
      }
    });
  }
}
