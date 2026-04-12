export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'twitter';
export type InfluencerStatus =
  | 'prospect'
  | 'contacted'
  | 'negotiating'
  | 'active'
  | 'declined';
export type OutreachChannel = 'email' | 'dm' | 'telegram';

export interface Influencer {
  id: string;
  handle: string;
  platform: Platform;
  full_name: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  avg_likes: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  profile_pic_url: string | null;
  profile_url: string | null;
  niche: string | null;
  status: InfluencerStatus;
  notes: string | null;
  last_scraped: string | null;
  created_at: string;
}

export interface Outreach {
  id: string;
  influencer_id: string;
  contact_date: string | null;
  channel: OutreachChannel | null;
  message_sent: string | null;
  response: string | null;
  follow_up_date: string | null;
  created_at: string;
}

export interface SearchRequestBody {
  handle: string;
  platform: Platform;
}

export interface BulkSearchRequestBody {
  handles: string[];
  platform: Platform;
}

export interface UpdateInfluencerBody {
  status?: InfluencerStatus;
  niche?: string;
  notes?: string;
}

export interface OutreachRequestBody {
  contact_date?: string;
  channel?: OutreachChannel;
  message_sent?: string;
  response?: string;
  follow_up_date?: string;
}

export interface InfluencerFilters {
  platform?: Platform;
  status?: InfluencerStatus;
  niche?: string;
  min_followers?: number;
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------
export type ConsentType = 'data_processing' | 'marketing' | 'analytics' | 'third_party_sharing';

export interface Consent {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  granted: boolean;
  ip_address: string | null;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsentRequestBody {
  consent_type: ConsentType;
  granted: boolean;
}

// ---------------------------------------------------------------------------
// DSAR (Data Subject Access Requests)
// ---------------------------------------------------------------------------
export type DsarRequestType = 'access' | 'erasure' | 'export';
export type DsarStatus = 'pending' | 'processing' | 'completed' | 'rejected';

// ---------------------------------------------------------------------------
// KYC (Know Your Customer)
// ---------------------------------------------------------------------------
export type KycStatus = 'pending' | 'verified' | 'rejected';

export interface KycVerification {
  id: string;
  user_id: string;
  kyc_status: KycStatus;
  provider: string;
  applicant_id: string | null;
  review_answer: string | null;
  rejection_reason: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KycVerifyRequestBody {
  /** ISO 3166-1 alpha-3 country code (e.g. "USA", "GBR") */
  country: string;
  /** Document type to verify (e.g. "PASSPORT", "ID_CARD", "DRIVERS") */
  id_doc_type: string;
}

export interface DsarRequest {
  id: string;
  user_id: string;
  user_email: string | null;
  request_type: DsarRequestType;
  status: DsarStatus;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
