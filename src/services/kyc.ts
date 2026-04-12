import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { supabase } from './supabase';
import { logger } from '../logger';
import { KycVerification, KycStatus } from '../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUMSUB_BASE_URL = process.env.SUMSUB_BASE_URL ?? 'https://api.sumsub.com';
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN ?? '';
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY ?? '';
const KYC_LEVEL_NAME = process.env.KYC_LEVEL_NAME ?? 'basic-kyc-level';

// ---------------------------------------------------------------------------
// Sumsub request signing
// ---------------------------------------------------------------------------

/**
 * Generates the Sumsub HMAC-SHA256 signature header for a request.
 * @see https://docs.sumsub.com/reference/authentication
 */
export function generateSignature(
  method: string,
  url: string,
  ts: number,
  body?: string
): string {
  const data = `${ts}${method.toUpperCase()}${url}${body ?? ''}`;
  return crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(data)
    .digest('hex');
}

/**
 * Makes a signed request to the Sumsub API.
 */
export async function sumsubRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const ts = Math.floor(Date.now() / 1000);
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const signature = generateSignature(method, path, ts, bodyStr);

  const resp = await axios({
    method,
    url: `${SUMSUB_BASE_URL}${path}`,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Token': SUMSUB_APP_TOKEN,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': String(ts),
    },
    data: bodyStr,
    timeout: 15_000,
  });

  return resp.data as T;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Retrieves the KYC verification record for a given user.
 * Returns `null` if no record exists.
 */
export async function getKycByUserId(
  userId: string
): Promise<KycVerification | null> {
  const { data, error } = await supabase
    .from('kyc_verifications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error.message, userId }, 'getKycByUserId error');
    throw new Error('Failed to fetch KYC status');
  }

  return data as KycVerification | null;
}

/**
 * Upserts a KYC record for a user.
 */
export async function upsertKycRecord(
  userId: string,
  fields: Partial<KycVerification>
): Promise<KycVerification> {
  const { data, error } = await supabase
    .from('kyc_verifications')
    .upsert(
      {
        user_id: userId,
        ...fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    logger.error({ err: error.message, userId }, 'upsertKycRecord error');
    throw new Error('Failed to upsert KYC record');
  }

  return data as KycVerification;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initiates KYC verification for a user.
 *
 * 1. Creates (or retrieves) a Sumsub applicant.
 * 2. Returns the persisted KYC record with the current status.
 *
 * If the user already has a `verified` status the call is idempotent.
 */
export async function initiateVerification(
  userId: string,
  _country: string,
  _idDocType: string
): Promise<KycVerification> {
  // Check existing record
  const existing = await getKycByUserId(userId);

  if (existing?.kyc_status === 'verified') {
    return existing;
  }

  // Create applicant on Sumsub
  let applicantId: string | undefined;
  try {
    const applicantResp = await sumsubRequest<{ id: string }>(
      'POST',
      '/resources/applicants?levelName=' + encodeURIComponent(KYC_LEVEL_NAME),
      { externalUserId: userId }
    );
    applicantId = applicantResp.id;
  } catch (err) {
    const axiosErr = err as AxiosError;
    logger.error(
      { err: axiosErr.message, status: axiosErr.response?.status, userId },
      'Sumsub applicant creation failed'
    );
    throw new Error('KYC provider error');
  }

  // Persist the pending record
  return upsertKycRecord(userId, {
    kyc_status: 'pending' as KycStatus,
    provider: 'sumsub',
    applicant_id: applicantId,
  });
}

/**
 * Fetches the current verification status from Sumsub and syncs it locally.
 */
export async function syncVerificationStatus(
  userId: string
): Promise<KycVerification> {
  const record = await getKycByUserId(userId);

  if (!record) {
    throw new Error('No KYC record found');
  }

  // Already terminal — no need to call provider
  if (record.kyc_status === 'verified') {
    return record;
  }

  if (!record.applicant_id) {
    return record;
  }

  try {
    const statusResp = await sumsubRequest<{
      reviewStatus: string;
      reviewResult?: { reviewAnswer: string; rejectLabels?: string[] };
    }>('GET', `/resources/applicants/${record.applicant_id}/requiredIdDocsStatus`);

    let newStatus: KycStatus = 'pending';
    let reviewAnswer: string | undefined;
    let rejectionReason: string | undefined;
    let verifiedAt: string | undefined;

    if (statusResp.reviewResult) {
      reviewAnswer = statusResp.reviewResult.reviewAnswer;
      if (reviewAnswer === 'GREEN') {
        newStatus = 'verified';
        verifiedAt = new Date().toISOString();
      } else if (reviewAnswer === 'RED') {
        newStatus = 'rejected';
        rejectionReason =
          statusResp.reviewResult.rejectLabels?.join(', ') ?? 'Verification failed';
      }
    }

    return upsertKycRecord(userId, {
      kyc_status: newStatus,
      review_answer: reviewAnswer ?? null,
      rejection_reason: rejectionReason ?? null,
      verified_at: verifiedAt ?? null,
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to sync KYC status from provider');
    // Return stale record rather than failing
    return record;
  }
}
