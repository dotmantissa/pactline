declare module "pg" {
  export class Pool {
    constructor(options?: unknown);
    query<T = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }
}
