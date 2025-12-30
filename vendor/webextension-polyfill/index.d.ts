export type StorageGetKeys = null | string | string[] | Record<string, unknown> | undefined;

export interface StorageArea {
  get(keys?: StorageGetKeys): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  getBytesInUse(keys?: StorageGetKeys): Promise<number>;
}

export interface StorageNamespace {
  local: StorageArea;
}

export interface Browser {
  storage: StorageNamespace;
  [key: string]: unknown;
}

declare const browser: Browser;
export default browser;
