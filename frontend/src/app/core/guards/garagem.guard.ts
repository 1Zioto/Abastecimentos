import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const garagemGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.hasGaragem()) return true;

  auth.clearGaragem();
  router.navigate(['/garagem']);
  return false;
};
