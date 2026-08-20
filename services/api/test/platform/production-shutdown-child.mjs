import { registerProductionShutdownHandlers } from '../../build/test/src/platform/production-database.composition.js';

registerProductionShutdownHandlers(() => new Promise(() => {}), {
  deadlineMs: 5_000,
  forceTerminate: () => process.exit(73),
});
process.on('message', (signal) => process.emit(signal));
process.send?.('ready');
