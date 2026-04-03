import { Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { scrapeProfile } from '../services/scrapeCreators';
import {
  Platform,
  InfluencerStatus,
  SearchRequestBody,
  BulkSearchRequestBody,
  UpdateInfluencerBody,
  OutreachRequestBody,
  InfluencerFilters,
} from '../types';

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
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}

// GET /api/influencers
export async function getInfluencers(
  req: Request<object, object, object, InfluencerFilters & { min_followers?: string }>,
  res: Response
): Promise<void> {
  try {
    const { platform, status, niche, min_followers } = req.query;

    let query = supabase
      .from('influencers')
      .select('*')
      .order('followers', { ascending: false });

    if (platform) {
      query = query.eq('platform', platform as Platform);
    }
    if (status) {
      query = query.eq('status', status as InfluencerStatus);
    }
    if (niche) {
      query = query.ilike('niche', `%${niche}%`);
    }
    if (min_followers) {
      query = query.gte('followers', Number(min_followers));
    }

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
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
      res.status(500).json({ error: outreachError.message });
      return;
    }

    res.json({ ...influencer, outreach: outreach ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}

// DELETE /api/influencers/:id
export async function deleteInfluencer(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('influencers')
      .delete()
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(204).send();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
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
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
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
          results.push({ handle, success: false, error: error.message });
        } else {
          results.push({ handle, success: true, data });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ handle, success: false, error: message });
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
}
