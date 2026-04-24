// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

const APP_BUILD_VERSION = '2026-04-24-02';

async function forceRefreshPwaCachesIfNeeded() {
  if (!('serviceWorker' in navigator)) return;

  const key = 'ft_app_build_version';
  const previous = localStorage.getItem(key);
  if (previous === APP_BUILD_VERSION) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(reg => reg.unregister().catch(() => false)));

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey).catch(() => false)));
  }

  localStorage.setItem(key, APP_BUILD_VERSION);
}

bootstrapApplication(AppComponent, appConfig)
  .then(async () => {
    if (environment.production && 'serviceWorker' in navigator) {
      await forceRefreshPwaCachesIfNeeded();
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/ngsw-worker.js', { updateViaCache: 'none' })
          .catch(err => console.error('SW register error', err));
      });
    }
  })
  .catch(err => console.error(err));
