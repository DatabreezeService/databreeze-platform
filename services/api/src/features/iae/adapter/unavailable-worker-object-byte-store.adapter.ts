import type {
  IaeWorkerObjectByteStorePortV1,
  IaeWorkerObjectStoreResultV1,
} from '../application/worker-object-transfer.port.js';

/** Fail-closed composition placeholder; it never fabricates a URL, path, key, or credential. */
export class UnavailableWorkerObjectByteStoreAdapter implements IaeWorkerObjectByteStorePortV1 {
  public readExact(
    _input: Parameters<IaeWorkerObjectByteStorePortV1['readExact']>[0],
  ): Promise<IaeWorkerObjectStoreResultV1> {
    void _input;
    return Promise.resolve(Object.freeze({ accepted: false, code: 'STORE_UNAVAILABLE' as const }));
  }

  public writeExact(
    _input: Parameters<IaeWorkerObjectByteStorePortV1['writeExact']>[0],
  ): Promise<IaeWorkerObjectStoreResultV1> {
    void _input;
    return Promise.resolve(Object.freeze({ accepted: false, code: 'STORE_UNAVAILABLE' as const }));
  }
}
