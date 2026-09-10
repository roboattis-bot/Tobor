export type ModelKind =
  | 'workshop'
  | 'printer'
  | 'robot'
  | 'gear'
  | 'bracket'
  | 'parcel'
  | 'check'
  | 'receipt'
  | 'blueprint'
  | 'library';
export interface ModelOptions {
  kind: ModelKind;
  hero?: boolean;
}
export interface ModelEngine {
  add: (element: HTMLElement, options: ModelOptions) => void;
  remove: (element: HTMLElement) => void;
  setMotion: (enabled: boolean) => void;
  dispose: () => void;
}
