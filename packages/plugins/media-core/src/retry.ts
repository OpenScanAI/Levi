import { setTimeout } from "node:timers/promises";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "timeout",
    "rate limit",
    "too many requests",
    "429",
    "503",
    "502",
    "504",
  ],
};

function isRetryableError(error: unknown, config: RetryConfig): boolean {
  const errorString = String(error).toLowerCase();
  return config.retryableErrors.some(pattern => errorString.includes(pattern.toLowerCase()));
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add up to 1s of jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: RetryConfig = defaultRetryConfig,
  logger?: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0 && logger) {
        logger.info(`${operationName} succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error) {
      lastError = error;

      if (attempt === config.maxRetries) {
        if (logger) {
          logger.error(`${operationName} failed after ${config.maxRetries} retries`, { error: String(error) });
        }
        throw error;
      }

      if (!isRetryableError(error, config)) {
        if (logger) {
          logger.warn(`${operationName} failed with non-retryable error`, { error: String(error) });
        }
        throw error;
      }

      const delay = calculateDelay(attempt, config);
      if (logger) {
        logger.warn(`${operationName} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`, { error: String(error) });
      }
      await setTimeout(delay);
    }
  }

  throw lastError;
}
