export const RETRY_DELAYS = [1000, 2000, 4000];

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
