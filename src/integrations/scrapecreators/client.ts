import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { UpstreamError } from '../../utils/errors';
import type { InfluencerProfile, Platform } from './types';
import { mapProfile } from './mappers';

export interface ScrapeCreatorsClientOptions {
  baseURL?: string;
  apiKey?: string;
  /** Max attempts including the first. Default 4. */
  maxAttempts?: number;
  /** Initial backoff in ms. Default 250. */
  baseBackoffMs?: number;
  /** Total timeout per attempt in ms. Default 15000. */
  timeoutMs?: number;
  /** Inject a custom axios instance (primarily for testing). */
  httpClient?: AxiosInstance;
}

const PROFILE_PATHS: Record<Platform, string> = {
  tiktok: '/v1/tiktok/profile',
  instagram: '/v1/instagram/profile',
  youtube: '/v1/youtube/channel',
  twitter: '/v1/twitter/profile',
};

/**
 * ScrapeCreators HTTP client.
 *
 * Concerns owned here (nothing else should reach out to the vendor):
 *   - authentication (API key header)
 *   - retry with exponential backoff + jitter on 429 / 5xx / network errors
 *   - timeouts
 *   - mapping vendor responses to our canonical {@link InfluencerProfile}
 *
 * Caching is intentionally NOT implemented here; it lives one layer up
 * in the `scrapecreators.service` which persists results to the
 * `scrape_jobs` cache table so it can be shared across instances.
 */
export class ScrapeCreatorsClient {
  private readonly http: AxiosInstance;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;

  constructor(opts: ScrapeCreatorsClientOptions = {}) {
    const baseURL = opts.baseURL ?? env().SCRAPECREATORS_BASE_URL;
    const apiKey = opts.apiKey ?? env().SCRAPECREATORS_API_KEY;
    this.maxAttempts = opts.maxAttempts ?? 4;
    this.baseBackoffMs = opts.baseBackoffMs ?? 250;

    this.http =
      opts.httpClient ??
      axios.create({
        baseURL,
        timeout: opts.timeoutMs ?? 15_000,
        headers: {
          'x-api-key': apiKey,
          accept: 'application/json',
          'user-agent': 'influencers-crm-backend/0.1',
        },
      });
  }

  async fetchProfile(platform: Platform, handle: string): Promise<InfluencerProfile> {
    const path = PROFILE_PATHS[platform];
    const config: AxiosRequestConfig = {
      method: 'GET',
      url: path,
      params: { handle },
    };
    const raw = await this.requestWithRetry<Record<string, unknown>>(config);
    return mapProfile(platform, handle, raw);
  }

  private async requestWithRetry<T>(config: AxiosRequestConfig): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const res = await this.http.request<T>(config);
        return res.data;
      } catch (err) {
        lastErr = err;
        const retriable = isRetriable(err);
        if (!retriable || attempt === this.maxAttempts) break;
        const delay = this.computeBackoff(attempt, err);
        logger.warn({ attempt, delay, url: config.url }, 'ScrapeCreators request failed, retrying');
        await sleep(delay);
      }
    }
    throw toUpstreamError(lastErr);
  }

  private computeBackoff(attempt: number, err: unknown): number {
    // Honour Retry-After header on 429/503 when present.
    if (axios.isAxiosError(err)) {
      const ra = err.response?.headers?.['retry-after'];
      if (typeof ra === 'string') {
        const secs = Number(ra);
        if (Number.isFinite(secs) && secs >= 0 && secs <= 60) return secs * 1000;
      }
    }
    const exp = this.baseBackoffMs * 2 ** (attempt - 1);
    // Full jitter.
    return Math.floor(Math.random() * exp);
  }
}

function isRetriable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true; // network/timeout
  const s = err.response.status;
  return s === 408 || s === 425 || s === 429 || (s >= 500 && s < 600);
}

function toUpstreamError(err: unknown): UpstreamError {
  if (axios.isAxiosError(err)) {
    return new UpstreamError('ScrapeCreators request failed', {
      status: err.response?.status,
      code: err.code,
    });
  }
  return new UpstreamError('ScrapeCreators request failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
