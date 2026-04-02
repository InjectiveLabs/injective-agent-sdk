import type { StorageProvider } from "../types.js";

export class CustomUrlStorage implements StorageProvider {
  private uri: string;

  constructor(uri: string) {
    this.uri = uri;
  }

  async uploadJSON(_data: unknown, _name?: string): Promise<string> {
    return this.uri;
  }
}
