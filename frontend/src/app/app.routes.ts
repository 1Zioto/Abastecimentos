import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { conferenciaVipeGuard } from './core/guards/conferencia-vipe.guard';
import { adminVisualizadorGuard } from './core/guards/admin-visualizador.guard';
import { garagemGuard } from './core/guards/garagem.guard';
import { operationalGuard } from './core/guards/operational.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'garagem',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/garagem/garagem.component').then(m => m.GaragemComponent)
  },
  {
    // Portal público do proprietário (acesso por link com token, sem login)
    path: 'portal/:token',
    loadComponent: () => import('./features/portal-proprietario/portal-proprietario.component').then(m => m.PortalProprietarioComponent)
  },
  {
    // Política de privacidade externa (acessível sem login)
    path: 'politica-privacidade',
    loadComponent: () => import('./features/politica-privacidade/politica-privacidade.component').then(m => m.PoliticaPrivacidadeComponent)
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard, garagemGuard],
    children: [
      { path: '', redirectTo: 'abastecimentos', pathMatch: 'full' },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'graficos',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/graficos-gerenciais/graficos-gerenciais.component').then(m => m.GraficosGerenciaisComponent)
      },
      {
        path: 'variacao-entradas-saidas',
        canActivate: [adminVisualizadorGuard],
        loadComponent: () => import('./features/variacao-entradas-saidas/variacao-entradas-saidas.component').then(m => m.VariacaoEntradasSaidasComponent)
      },
      {
        path: 'dashboard-operacional',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dashboard-operacional/dashboard-operacional.component').then(m => m.DashboardOperacionalComponent)
      },
      {
        path: 'abastecimentos',
        loadComponent: () => import('./features/abastecimentos/list/abastecimentos-list.component').then(m => m.AbastecimentosListComponent)
      },
      {
        path: 'abastecimentos/novo',
        loadComponent: () => import('./features/abastecimentos/form/abastecimento-form.component').then(m => m.AbastecimentoFormComponent)
      },
      {
        path: 'integracao-atua',
        canActivate: [adminVisualizadorGuard],
        loadComponent: () => import('./features/integracao-atua/integracao-atua.component').then(m => m.IntegracaoAtuaComponent)
      },
      {
        path: 'abastecimentos/:id/editar',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/abastecimentos/form/abastecimento-form.component').then(m => m.AbastecimentoFormComponent)
      },
      {
        path: 'baixa',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/baixa/baixa.component').then(m => m.BaixaComponent)
      },
      {
        path: 'nova-baixa-comprovante',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/nova-baixa-comprovante/nova-baixa-comprovante.component').then(m => m.NovaBaixaComprovanteComponent)
      },
      {
        path: 'auditoria-abastecimentos',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/auditoria-abastecimentos/auditoria-abastecimentos.component').then(m => m.AuditoriaAbastecimentosComponent)
      },
      {
        path: 'conferencia-vipe',
        canActivate: [conferenciaVipeGuard],
        loadComponent: () => import('./features/conferencia-vipe/conferencia-vipe.component').then(m => m.ConferenciaVipeComponent)
      },
      {
        path: 'entrada-notas',
        loadComponent: () => import('./features/entrada-notas/entrada-notas.component').then(m => m.EntradaNotasComponent)
      },
      {
        path: 'relatorios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/relatorios/relatorios.component').then(m => m.RelatoriosComponent)
      },
      {
        path: 'relatorio-faturamento',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/relatorio-faturamento/relatorio-faturamento.component').then(m => m.RelatorioFaturamentoComponent)
      },
      {
        path: 'valores-combustivel',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/valores-combustivel/valores-combustivel.component').then(m => m.ValoresCombustivelComponent)
      },
      {
        path: 'despesas-avulsas',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/despesas-avulsas/despesas-avulsas.component').then(m => m.DespesasAvulsasComponent)
      },
      {
        path: 'conciliacao-bancaria',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/conciliacao-bancaria/conciliacao-bancaria.component').then(m => m.ConciliacaoBancariaComponent)
      },
      {
        path: 'conferencia-recebedores',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/conferencia-recebedores/conferencia-recebedores.component').then(m => m.ConferenciaRecebedoresComponent)
      },
      {
        path: 'proprietarios',
        loadComponent: () => import('./features/proprietarios/proprietarios.component').then(m => m.ProprietariosComponent)
      },
      {
        path: 'veiculos',
        loadComponent: () => import('./features/veiculos/veiculos.component').then(m => m.VeiculosComponent)
      },
      {
        path: 'transferencia-veiculo',
        canActivate: [operationalGuard],
        loadComponent: () => import('./features/transferencia-veiculo/transferencia-veiculo.component').then(m => m.TransferenciaVeiculoComponent)
      },
      {
        path: 'motoristas',
        loadComponent: () => import('./features/motoristas/motoristas.component').then(m => m.MotoristasComponent)
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/usuarios/usuarios.component').then(m => m.UsuariosComponent)
      },
      {
        path: 'notificacoes-criticas',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/notificacoes-criticas/notificacoes-criticas.component').then(m => m.NotificacoesCriticasComponent)
      },
      {
        path: 'historico-alteracoes',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/historico-alteracoes/historico-alteracoes.component').then(m => m.HistoricoAlteracoesComponent)
      },
      {
        path: 'app-erros',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/app-erros/app-erros.component').then(m => m.AppErrosComponent)
      },
      {
        path: 'encerrantes-bomba',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/encerrantes-bomba/encerrantes-bomba.component').then(m => m.EncerrantesBombaComponent)
      },
      {
        path: 'encerrante-diario',
        canActivate: [operationalGuard],
        loadComponent: () => import('./features/encerrante-diario/encerrante-diario.component').then(m => m.EncerranteDiarioComponent)
      },
      {
        path: 'controle-encerrante-privado',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/controle-encerrante/controle-encerrante.component').then(m => m.ControleEncerranteComponent)
      },
      {
        path: 'balancete-privado',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/balancete-privado/balancete-privado.component').then(m => m.BalancetePrivadoComponent)
      },
      {
        path: 'tanques-privado',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/tanques-privado/tanques-privado.component').then(m => m.TanquesPrivadoComponent)
      },
      {
        path: 'configuracoes',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/configuracoes/configuracoes.component').then(m => m.ConfiguracoesComponent)
      },
    ]
  },
  { path: '**', redirectTo: '' }
];
