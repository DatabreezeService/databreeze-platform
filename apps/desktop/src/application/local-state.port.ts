export interface LocalStatePort {
  getSafeState(): Promise<unknown>;
}
