// src/app/core/guards/admin.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toastr = inject(ToastrService);
  const user = auth.currentUser();
  if (user?.tipo === 'admin') return true;

  // Antes redirecionava em silêncio (a tela "não abria" sem explicação).
  // Agora avisa o motivo para não parecer que o botão está quebrado.
  if (!user) {
    toastr.warning('Sessão não carregada. Faça login novamente e tente outra vez.');
  } else {
    toastr.error('Esta tela é restrita a administradores. Seu perfil atual é: ' + (user.tipo || 'desconhecido') + '.');
  }
  router.navigate(['/abastecimentos']);
  return false;
};
