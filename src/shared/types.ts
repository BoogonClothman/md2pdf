// Shared types between main / preload / renderer processes.

export interface PdfOptions {
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  /** Margin in millimeters (0 - 50). */
  marginMm: number;
  /** Show page numbers in footer. */
  pageNumbers: boolean;
  /** Generate PDF bookmarks from headings. */
  bookmarks: boolean;
}

export interface ExportRequest {
  /** Raw markdown source; the export page renders it with the full pipeline. */
  markdown: string;
  options: PdfOptions;
  suggestedName: string;
  /** Path of the source .md file — used to resolve relative image paths. */
  baseDir?: string;
}

export interface ExportResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

export interface OpenFileResult {
  path: string;
  content: string;
}

export interface SaveResult {
  canceled: boolean;
  path?: string;
  error?: string;
}

/** API exposed on `window.api` by the preload script. */
export interface Md2PdfApi {
  platform: string;
  fileOpen(): Promise<OpenFileResult | null>;
  fileOpenPath(p: string): Promise<OpenFileResult>;
  fileSave(path: string | null, content: string, suggestedName?: string): Promise<SaveResult>;
  pdfExport(req: ExportRequest): Promise<ExportResult>;
  setDirty(dirty: boolean, fileName?: string): void;
  forceClose(): void;
  /** Open an http(s)/mailto URL in the system browser (scheme-validated in main). */
  openExternal(url: string): void;
  getPathForFile(file: File): string;
  onMenu(cb: (action: string) => void): void;
  /** Export page only: */
  onExportPayload(cb: (payload: { markdown: string; title: string; baseDir?: string }) => void): void;
  signalExportReady(): void;
  signalExportDone(): void;
}

declare global {
  interface Window {
    api: Md2PdfApi;
  }
}
