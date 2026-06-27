// src/app/core/services/excel-export.service.ts
import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class ExcelExportService {
  /**
   * Gera e baixa um arquivo .xlsx a partir de uma lista de objetos.
   * As chaves dos objetos viram cabeçalhos das colunas.
   */
  export(filename: string, rows: Record<string, any>[], sheetName = 'Dados') {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({
      wch: Math.min(
        42,
        Math.max(k.length, ...rows.slice(0, 200).map((r) => String(r[k] ?? '').length)) + 2
      ),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  }
}
