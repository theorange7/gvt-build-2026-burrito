function num(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function maxConcurrency(): number {
  return num(process.env.WRAP_MAX_CONCURRENCY, 8);
}

export function perInstallLimit(): number {
  return num(process.env.WRAP_PER_INSTALL_LIMIT, 1);
}

export function resultTtlHours(): number {
  return num(process.env.WRAP_RESULT_TTL_HOURS, 24);
}

export function registerRateLimitPerHour(): number {
  return num(process.env.WRAP_REGISTER_RATE_LIMIT_PER_HOUR, 10);
}

/**
 * After this many deliveries, the worker stops retrying and persists
 * `status='failed'` with `errorCode='max-retries'`. The Service Bus queue
 * itself also enforces `maxDeliveryCount` (set in Terraform), but we make the
 * decision here so the client polling sees a terminal status without waiting
 * for DLQ propagation.
 */
export function maxDeliveries(): number {
  return num(process.env.WRAP_MAX_DELIVERIES, 3);
}

export function decideBusy(globalInflight: number): boolean {
  return globalInflight >= maxConcurrency();
}

export function decideAccept(perInstall: number): boolean {
  return perInstall < perInstallLimit();
}
