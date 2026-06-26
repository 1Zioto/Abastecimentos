// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

const APP_BUILD_VERSION = '2026-05-28-login-fix';

async function disableWebServiceWorkerCache() {
  if (!('serviceWorker' in navigator)) return;

  const reloadKey = `ft_sw_disabled_${APP_BUILD_VERSION}`;
  const hadController = !!navigator.serviceWorker.controller;

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(reg => reg.unregister().catch(() => false)));

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey).catch(() => false)));
  }

  if (hadController && sessionStorage.getItem(reloadKey) !== '1') {
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  }
}

bootstrapApplication(AppComponent, appConfig)
  .then(async () => {
    if (environment.production && 'serviceWorker' in navigator) {
      await disableWebServiceWorkerCache();
    }
  })
  .catch(err => console.error(err));
