import { Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class PdfThumbnailService {
  private readonly thumbnails = signal<Record<string, string>>({});
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  private workerConfigured = false;

  constructor(private readonly api: ApiService) {}

  get(url: string): string | null {
    const thumbnail = this.thumbnails()[url];
    if (thumbnail) return thumbnail;

    if (!this.pending.has(url) && !this.failed.has(url)) {
      this.pending.add(url);
      queueMicrotask(() => void this.render(url));
    }

    return null;
  }

  private async render(url: string): Promise<void> {
    try {
      const pdfjs = await import('pdfjs-dist');
      if (!this.workerConfigured) {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdf.worker.min.mjs',
          document.baseURI,
        ).toString();
        this.workerConfigured = true;
      }

      const blob = await firstValueFrom(this.api.downloadCloudinaryMedia(url));
      const data = new Uint8Array(await blob.arrayBuffer());
      const pdfDocument = await pdfjs.getDocument({ data }).promise;
      const page = await pdfDocument.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.5, 240 / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponivel');

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      this.thumbnails.update((current) => ({
        ...current,
        [url]: canvas.toDataURL('image/jpeg', 0.82),
      }));
      await pdfDocument.destroy();
    } catch {
      this.failed.add(url);
    } finally {
      this.pending.delete(url);
    }
  }
}
