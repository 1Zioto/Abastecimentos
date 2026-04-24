import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'abastecimentos', pathMatch: 'full' },
      {
        path: 'dashboard',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
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
        loadComponent: () => import('./features/valores-combustivel/valores-combustivel.component').then(m => m.ValoresCombustivelComponent)
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
        path: 'motoristas',
        loadComponent: () => import('./features/motoristas/motoristas.component').then(m => m.MotoristasComponent)
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/usuarios/usuarios.component').then(m => m.UsuariosComponent)
      },
    ]
  },
  { path: '**', redirectTo: '' }
];
