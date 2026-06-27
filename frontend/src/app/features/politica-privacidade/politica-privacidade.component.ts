// src/app/features/politica-privacidade/politica-privacidade.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-politica-privacidade',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="privacy-page">
      <!-- Background elements matching login page aesthetics -->
      <div class="privacy-bg">
        <div class="bg-orb orb1"></div>
        <div class="bg-orb orb2"></div>
        <div class="grid-lines"></div>
      </div>

      <div class="privacy-container">
        <header class="privacy-header">
          <div class="brand">
            <span class="brand-icon">⛽</span>
            <div>
              <h1>Abastecimento Vipe</h1>
              <p>Vipe Transportes (Garagem)</p>
            </div>
          </div>
          <button routerLink="/login" class="back-btn" id="btn-back-login">
            Voltar para o Login
          </button>
        </header>

        <main class="privacy-card">
          <h2 class="main-title">Política de Privacidade</h2>
          <p class="last-updated">Última atualização: 25 de junho de 2026</p>

          <p class="intro">
            A <strong>Vipe Transportes</strong> valoriza a sua privacidade. Esta Política de Privacidade explica como o aplicativo 
            <strong>Abastecimento Vipe</strong> coleta, utiliza, armazena e protege as informações geradas durante o controle 
            de abastecimento de combustíveis de nossos veículos e de parceiros/agregados.
          </p>

          <hr class="separator" />

          <!-- Navigation / Index -->
          <nav class="privacy-nav">
            <h3>Nesta página:</h3>
            <ul>
              <li><a href="#coleta">1. Informações Coletadas</a></li>
              <li><a href="#uso">2. Como Usamos seus Dados</a></li>
              <li><a href="#compartilhamento">3. Compartilhamento de Informações</a></li>
              <li><a href="#seguranca">4. Armazenamento e Segurança</a></li>
              <li><a href="#direitos">5. Seus Direitos como Usuário</a></li>
              <li><a href="#retencao">6. Retenção e Exclusão</a></li>
              <li><a href="#contato">7. Suporte e Contato</a></li>
            </ul>
          </nav>

          <hr class="separator" />

          <section id="coleta" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">📋</span>
              <h3>1. Informações Coletadas</h3>
            </div>
            <p>Para o funcionamento correto e auditoria do sistema de abastecimento, coletamos as seguintes informações:</p>
            <ul>
              <li><strong>Dados de Acesso:</strong> Login e senha (criptografada) fornecidos pela administração da empresa para acesso ao sistema.</li>
              <li><strong>Informações do Veículo:</strong> Placa do veículo, modelo e proprietário associado.</li>
              <li><strong>Informações de Refugo/Abastecimento:</strong> Data e hora da operação, quantidade de litros abastecidos, valor unitário do combustível, valor total, quilometragem (odômetro) do veículo e posto de combustível selecionado.</li>
              <li><strong>Comprovantes Digitais:</strong> Fotos ou digitalizações de cupons fiscais e notas fiscais anexadas no momento do lançamento do abastecimento.</li>
            </ul>
          </section>

          <section id="uso" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">⚙️</span>
              <h3>2. Como Usamos seus Dados</h3>
            </div>
            <p>Todos os dados coletados são usados exclusivamente para fins operacionais e de gestão de frota, incluindo:</p>
            <ul>
              <li>Controle de consumo de combustível e eficiência dos veículos.</li>
              <li>Conciliação e auditoria das notas fiscais e cupons emitidos pelos postos parceiros.</li>
              <li>Prestação de contas e geração de extratos financeiros para os proprietários de veículos agregados.</li>
              <li>Prevenção a fraudes e garantia de conformidade nas rotinas de abastecimento.</li>
            </ul>
          </section>

          <section id="compartilhamento" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">🔗</span>
              <h3>3. Compartilhamento de Informações</h3>
            </div>
            <p>Temos um compromisso rígido com a privacidade. Suas informações não são vendidas, alugadas ou compartilhadas com terceiros para fins publicitários. O compartilhamento ocorre apenas nas seguintes situações:</p>
            <ul>
              <li><strong>Com Proprietários de Veículos Agregados:</strong> Relatórios e dados de abastecimento dos seus respectivos veículos são compartilhados de forma transparente via Portal do Proprietário público (acessível apenas através de links únicos e seguros contendo tokens criptográficos de identificação).</li>
              <li><strong>Compostos e Parceiros:</strong> Apenas dados estritamente necessários para validação do cupom fiscal ou nota fiscal.</li>
              <li><strong>Obrigação Legal:</strong> Quando exigido por lei ou autoridade governamental competente.</li>
            </ul>
          </section>

          <section id="seguranca" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">🔒</span>
              <h3>4. Armazenamento e Segurança</h3>
            </div>
            <p>Adotamos medidas técnicas e administrativas robustas para proteger seus dados pessoais contra acessos não autorizados, perda, destruição ou alteração:</p>
            <ul>
              <li><strong>Criptografia de Senhas:</strong> Todas as senhas de usuários são criptografadas (hashing seguro) antes do armazenamento.</li>
              <li><strong>Transmissão Segura:</strong> A comunicação entre o aplicativo, o painel administrativo e os servidores é realizada sob o protocolo HTTPS (criptografia TLS).</li>
              <li><strong>Hospedagem Confiável:</strong> Nosso banco de dados e APIs estão hospedados em infraestrutura de nuvem segura com controles rigorosos de acesso físico e lógico.</li>
            </ul>
          </section>

          <section id="direitos" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">👤</span>
              <h3>5. Seus Direitos como Usuário</h3>
            </div>
            <p>Em conformidade com a Lei Geral de Proteção de Dados (LGPD) do Brasil, você possui direitos garantidos sobre seus dados, tais como:</p>
            <ul>
              <li>Confirmar a existência do tratamento de seus dados.</li>
              <li>Acessar as informações mantidas no sistema sobre você ou seu veículo.</li>
              <li>Solicitar a correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Revogar o consentimento ou solicitar a exclusão de dados não obrigatórios por lei.</li>
            </ul>
            <p class="note-box">
              <strong>Nota:</strong> Como este sistema é uma ferramenta corporativa de controle de frota da VIPE Transportes, determinados dados de abastecimento e notas fiscais de veículos da empresa ou agregados devem ser mantidos para cumprimento de obrigações contábeis e fiscais, não podendo ser excluídos imediatamente a pedido do usuário.
            </p>
          </section>

          <section id="retencao" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">⏳</span>
              <h3>6. Retenção e Exclusão</h3>
            </div>
            <p>
              Mantemos as informações de abastecimento e registros pelo tempo necessário para cumprir as finalidades descritas nesta política, 
              para a execução do contrato de prestação de serviços com agregados, ou para cumprir obrigações fiscais e legais de arquivo 
              contábil (que podem variar de 5 a 10 anos sob a legislação fiscal brasileira).
            </p>
          </section>

          <section id="contato" class="privacy-section">
            <div class="section-header">
              <span class="section-icon">✉️</span>
              <h3>7. Suporte e Contato</h3>
            </div>
            <p>
              Se você tiver dúvidas sobre esta política, sobre como tratamos seus dados, ou se desejar exercer qualquer um de seus direitos 
              previstos em lei, entre em contato diretamente com o Encarregado de Proteção de Dados (DPO) da VIPE Transportes.
            </p>
            <div class="contact-box">
              <p><strong>VIPE Transportes</strong></p>
              <p>📍 Setor de Garagem e Administração</p>
              <p>📧 E-mail: suporte&#64;vipetransportes.com.br</p>
            </div>
          </section>
        </main>

        <footer class="privacy-footer">
          <p>© 2026 VIPE Transportes. Todos os direitos reservados.</p>
          <p class="footer-links">
            <a routerLink="/login">Login do Sistema</a> · 
            <a href="#top">Voltar ao topo</a>
          </p>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');

    .privacy-page {
      min-height: 100vh;
      background: var(--bg-app);
      position: relative;
      overflow-x: hidden;
      font-family: 'Inter', sans-serif;
      color: var(--text-primary);
      padding: 40px 20px;
    }

    .privacy-bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }
    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.08;
    }
    .orb1 {
      width: 500px;
      height: 500px;
      background: var(--brand-yellow);
      top: -100px;
      right: -100px;
    }
    .orb2 {
      width: 400px;
      height: 400px;
      background: var(--brand-charcoal);
      bottom: -100px;
      left: -100px;
    }
    .grid-lines {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(249, 203, 0, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(249, 203, 0, 0.04) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    .privacy-container {
      position: relative;
      z-index: 10;
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .privacy-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 8px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      font-size: 36px;
    }
    .brand h1 {
      font-family: 'Rajdhani', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: var(--brand-yellow);
      letter-spacing: 2px;
      margin: 0;
    }
    .brand p {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .back-btn {
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 16px;
      color: var(--text-primary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .back-btn:hover {
      border-color: var(--brand-yellow);
      color: var(--brand-yellow);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(249, 203, 0, 0.12);
    }

    .privacy-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
    }

    .main-title {
      font-family: 'Rajdhani', sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .last-updated {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }

    .intro {
      font-size: 15px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .separator {
      border: 0;
      height: 1px;
      background: var(--border-color);
      margin: 24px 0;
    }

    .privacy-nav {
      background: var(--bg-muted);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 20px;
    }
    .privacy-nav h3 {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 12px;
      color: var(--text-primary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .privacy-nav ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
    }
    .privacy-nav a {
      color: #2563eb;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      transition: color 0.2s;
    }
    .privacy-nav a:hover {
      color: var(--brand-yellow);
      text-decoration: underline;
    }

    .privacy-section {
      margin-bottom: 36px;
      scroll-margin-top: 20px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .section-icon {
      font-size: 20px;
    }
    .privacy-section h3 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }
    .privacy-section p {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    .privacy-section ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    .privacy-section li {
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .note-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      border-radius: 4px 8px 8px 4px;
      margin-top: 16px;
      font-size: 13px !important;
      color: #92400e !important;
    }
    .note-box strong {
      color: #92400e;
    }

    .contact-box {
      background: var(--bg-muted);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
    }
    .contact-box p {
      margin-bottom: 6px !important;
      font-size: 13px !important;
    }
    .contact-box p:last-child {
      margin-bottom: 0 !important;
    }

    .privacy-footer {
      text-align: center;
      padding: 20px 0;
      color: var(--text-muted);
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .footer-links {
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .footer-links a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.2s;
    }
    .footer-links a:hover {
      color: var(--brand-yellow);
    }

    @media (max-width: 600px) {
      .privacy-page {
        padding: 20px 12px;
      }
      .privacy-card {
        padding: 24px 16px;
      }
      .privacy-header {
        flex-direction: column;
        align-items: flex-start;
      }
      .back-btn {
        width: 100%;
        text-align: center;
      }
      .privacy-nav ul {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class PoliticaPrivacidadeComponent {}
