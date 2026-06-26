import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { garagemGuard } from './core/guards/garagem.guard';

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
        path: 'abastecimentos',
        loadComponent: () => import('./features/abastecimentos/list/abastecimentos-list.component').then(m => m.AbastecimentosListComponent)
      },
      {
        path: 'abastecimentos/novo',
        loadComponent: () => import('./features/abastecimentos/form/abastecimento-form.component').then(m => m.AbastecimentoFormComponent)
      },
      {
        path: 'lancar-sofit',
        loadComponent: () => import('./features/abastecimentos/form/abastecimento-form.component').then(m => m.AbastecimentoFormComponent)
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
        path: 'entrada-notas',
        loadComponent: () => import('./features/entrada-notas/entrada-notas.component').then(m => m.EntradaNotasComponent)
      },
      {
        path: 'relatorios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/relatorios/relatorios.component').then(m => m.RelatoriosComponent)
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
        path: 'proprietarios',
        loadComponent: () => import('./features/proprietarios/proprietarios.component').then(m => m.ProprietariosComponent)
      },
      {
        path: 'veiculos',
        loadComponent: () => import('./features/veiculos/veiculos.component').then(m => m.VeiculosComponent)
      },
      {
        path: 'transferencia-veiculo',
        canActivate: [adminGuard],
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
