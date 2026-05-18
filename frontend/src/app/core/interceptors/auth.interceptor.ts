// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { SKIP_AUTH_RETRY } from './auth-context';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();
  const skipAuthRetry = req.context.get(SKIP_AUTH_RETRY);
  const url = req.url.toLowerCase();
  const isAuthEndpoint =
    url.includes('/auth/login') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/refresh');

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError(err => {
      const canTryRefresh = err.status === 401 && !skipAuthRetry && !isAuthEndpoint;
      if (canTryRefresh) {
        return auth.refreshToken().pipe(
          switchMap(newToken => {
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` }
            });
            return next(retryReq);
          }),
          catchError(refreshErr => {
            auth.clearSession(false);
            router.navigate(['/login']);
            return throwError(() => refreshErr);
          })
        );
      }

      if (err.status === 401 && !isAuthEndpoint) {
        auth.clearSession(false);
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
