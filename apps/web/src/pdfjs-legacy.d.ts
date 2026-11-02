// Small type shim so `tsc` accepts the pdf.js legacy build (loaded only when a PDF is chosen).
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: { data: Uint8Array }): { promise: Promise<unknown> };
}
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}
