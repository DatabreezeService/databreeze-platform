export class NotReadyError extends Error {
  constructor() {
    super('Readiness check failed');
    this.name = 'NotReadyError';
  }
}
