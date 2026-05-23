import { runBackupCycle, msUntilNextNightlyRunUtc } from './services/backups/backupRunner.js';

function log(event: string, details: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
}

async function scheduleLoop(): Promise<void> {
  const targetHourUtc = Number(process.env.BACKUP_SCHEDULE_HOUR_UTC ?? '2');
  while (true) {
    const waitMs = msUntilNextNightlyRunUtc(targetHourUtc);
    log('BACKUP_WORKER_SLEEP', { waitMs, targetHourUtc });
    await new Promise(resolve => setTimeout(resolve, waitMs));
    try {
      await runBackupCycle();
    } catch (error) {
      log('BACKUP_WORKER_CYCLE_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown cycle error',
      });
    }
  }
}

async function main(): Promise<void> {
  log('BACKUP_WORKER_STARTED');
  if (process.env.BACKUP_RUN_ON_STARTUP === 'true') {
    await runBackupCycle().catch((error: unknown) => {
      log('BACKUP_WORKER_STARTUP_RUN_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown startup run error',
      });
    });
  }
  await scheduleLoop();
}

void main();

