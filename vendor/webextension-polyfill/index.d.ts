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

export interface PermissionSet {
  origins?: string[];
  permissions?: string[];
}

export interface PermissionsNamespace {
  contains(permissions: PermissionSet): Promise<boolean>;
  request(permissions: PermissionSet): Promise<boolean>;
}

export interface Browser {
  storage: StorageNamespace;
  permissions: PermissionsNamespace;
  [key: string]: unknown;
}

declare const browser: Browser;
export default browser;
