import { Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { scrapeProfile } from '../services/scrapeCreators';
import { logger } from '../logger';
import {
  Platform,
  InfluencerStatus,
  SearchRequestBody,
  BulkSearchRequestBody,
  UpdateInfluencerBody,
  OutreachRequestBody,
  InfluencerFilters,
} from '../types';

/** Default and maximum page sizes for pagination */
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10_000;

/** Log server-side and return a generic error to the client. */
function handleError(res: Response, err: unknown, context: string): void {
  logger.error({ context, err }, `Error in ${context}`);
  res.status(500).json({ error: 'Internal server error' });
}

// POST /api/influencers/search
export async function searchInfluencer(
  req: Request<object, object, SearchRequestBody>,
  res: Response
): Promise<void> {
  try {
    const { handle, platform } = req.body;

    if (!handle || !platform) {
      res.status(400).json({ error: 'handle and platform are required' });
      return;
    }

    const profileData = await scrapeProfile(handle, platform);

    // Upsert by handle + platform to avoid duplicates across platforms
    const { data, error } = await supabase
      .from('influencers')
      .upsert(
        { ...profileData },
        { onConflict: 'handle,platform', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (error) {
      logger.error({ err: error.message }, 'searchInfluencer supabase error');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.status(201).json(data);
  } catch (err: unknown) {
    handleError(res, err, 'searchInfluencer');
  }
}

// GET /api/influencers
export async function getInfluencers(
  req: Request<object, object, object, InfluencerFilters & { min_followers?: string; page?: string; limit?: string }>,
  res: Response
): Promise<void> {
  try {
    const { platform, status, niche, min_followers, page: pageStr, limit: limitStr } = req.query;

    // Pagination
    const page = Math.max(1, Math.min(MAX_PAGE, parseInt(pageStr as string, 10) || 1));
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limitStr as string, 10) || DEFAULT_PAGE_SIZE));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('influencers')
      .select('*', { count: 'exact' })
      .order('followers', { ascending: false })
      .range(from, to);

    if (platform) {
      query = query.eq('platform', platform as Platform);
    }
    if (status) {
      query = query.eq('status', status as InfluencerStatus);
    }
    if (niche) {
      // Sanitize wildcard characters to prevent ILIKE injection
      const sanitized = String(niche).replace(/[%_\\]/g, '\\$&');
      query = query.ilike('niche', `%${sanitized}%`);
    }
    if (min_followers) {
      const num = Number(min_followers);
      if (!Number.isFinite(num) || num < 0) {
        res.status(400).json({ error: 'min_followers must be a non-negative number' });
        return;
      }
      query = query.gte('followers', num);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ err: error.message }, 'getInfluencers supabase error');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.json({
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
    });
  } catch (err: unknown) {
    handleError(res, err, 'getInfluencers');
  }
}

// GET /api/influencers/:id
export async function getInfluencerById(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const { data: influencer, error: influencerError } = await supabase
      .from('influencers')
      .select('*')
      .eq('id', id)
      .single();

    if (influencerError) {
      res.status(404).json({ error: 'Influencer not found' });
      return;
    }

    const { data: outreach, error: outreachError } = await supabase
      .from('outreach')
      .select('*')
      .eq('influencer_id', id)
      .order('contact_date', { ascending: false });

    if (outreachError) {
      logger.error({ err: outreachError.message }, 'getInfluencerById supabase error');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.json({ ...influencer, outreach: outreach ?? [] });
  } catch (err: unknown) {
    handleError(res, err, 'getInfluencerById');
  }
}

// PATCH /api/influencers/:id
export async function updateInfluencer(
  req: Request<{ id: string }, object, UpdateInfluencerBody>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { status, niche, notes } = req.body;

    const updates: Partial<UpdateInfluencerBody> = {};
    if (status !== undefined) updates.status = status;
    if (niche !== undefined) updates.niche = niche;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const { data, error } = await supabase
      .from('influencers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // PGRST116: "JSON object requested, multiple (or no) rows returned" — not found
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Influencer not found' });
        return;
      }
      logger.error({ err: error.message }, 'updateInfluencer supabase error');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.json(data);
  } catch (err: unknown) {
    handleError(res, err, 'updateInfluencer');
  }
}

// DELETE /api/influencers/:id
export async function deleteInfluencer(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('influencers')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      logger.error({ err: error.message }, 'deleteInfluencer supabase error');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Influencer not found' });
      return;
    }

    res.status(204).send();
  } catch (err: unknown) {
    handleError(res, err, 'deleteInfluencer');
  }
}

// POST /api/influencers/:id/outreach
export async function createOutreach(
  req: Request<{ id: string }, object, OutreachRequestBody>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { contact_date, channel, message_sent, response, follow_up_date } =
      req.body;

    const { data, error } = await supabase
      .from('outreach')
      .insert({
        influencer_id: id,
        contact_date: contact_date ?? null,
        channel: channel ?? null,
        message_sent: message_sent ?? null,
        response: response ?? null,
        follow_up_date: follow_up_date ?? null,
      })
      .select()
      .single();

    if (error) {
      // FK violation (23503): influencer_id references a non-existent influencer
      if (error.code === '23503') {
        res.status(404).json({ error: 'Influencer not found' });
        return;
      }
      logger.error({ err: error.message }, 'createOutreach supabase error');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    res.status(201).json(data);
  } catch (err: unknown) {
    handleError(res, err, 'createOutreach');
  }
}

// POST /api/influencers/bulk-search
export async function bulkSearchInfluencers(
  req: Request<object, object, BulkSearchRequestBody>,
  res: Response
): Promise<void> {
  try {
    const { handles, platform } = req.body;

    if (!handles || !Array.isArray(handles) || handles.length === 0 || !platform) {
      res.status(400).json({ error: 'handles (array) and platform are required' });
      return;
    }

    const results: { handle: string; success: boolean; data?: unknown; error?: string }[] = [];

    for (const handle of handles) {
      try {
        const profileData = await scrapeProfile(handle, platform);

        const { data, error } = await supabase
          .from('influencers')
          .upsert(
            { ...profileData },
            { onConflict: 'handle,platform', ignoreDuplicates: false }
          )
          .select()
          .single();

        if (error) {
          logger.error({ handle, err: error.message }, 'bulkSearchInfluencers supabase error');
          results.push({ handle, success: false, error: 'Failed to save profile' });
        } else {
          results.push({ handle, success: true, data });
        }
      } catch (err: unknown) {
        logger.error({ handle, err: err instanceof Error ? err.message : err }, 'bulkSearchInfluencers error');
        results.push({ handle, success: false, error: 'Failed to process handle' });
      }
    }

    const summary = {
      total: handles.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };

    res.status(201).json(summary);
  } catch (err: unknown) {
    handleError(res, err, 'bulkSearchInfluencers');
  }
}
