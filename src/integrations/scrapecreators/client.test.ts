import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { ScrapeCreatorsClient } from '../../../src/integrations/scrapecreators';

describe('ScrapeCreatorsClient', () => {
  function makeClient() {
    const instance = axios.create({ baseURL: 'https://api.test' });
    const mock = new MockAdapter(instance);
    const client = new ScrapeCreatorsClient({
      httpClient: instance,
      baseBackoffMs: 1,
      maxAttempts: 3,
    });
    return { client, mock };
  }

  it('maps a TikTok profile response to the canonical shape', async () => {
    const { client, mock } = makeClient();
    mock.onGet('/v1/tiktok/profile').reply(200, {
      displayName: 'Alice',
      followers_count: 1234,
      is_verified: true,
      country: 'US',
    });
    const p = await client.fetchProfile('tiktok', 'alice');
    expect(p.platform).toBe('tiktok');
    expect(p.handle).toBe('alice');
    expect(p.displayName).toBe('Alice');
    expect(p.followers).toBe(1234);
    expect(p.verified).toBe(true);
    expect(p.country).toBe('US');
    expect(p.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('retries transient 5xx errors then succeeds', async () => {
    const { client, mock } = makeClient();
    mock
      .onGet('/v1/instagram/profile')
      .replyOnce(500)
      .onGet('/v1/instagram/profile')
      .replyOnce(503)
      .onGet('/v1/instagram/profile')
      .reply(200, { followers: 10 });

    const p = await client.fetchProfile('instagram', 'bob');
    expect(p.followers).toBe(10);
    expect(mock.history.get.length).toBe(3);
  });

  it('raises UpstreamError after exhausting retries', async () => {
    const { client, mock } = makeClient();
    mock.onGet('/v1/youtube/channel').reply(500);
    await expect(client.fetchProfile('youtube', 'carol')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      status: 502,
    });
    expect(mock.history.get.length).toBe(3);
  });

  it('does not retry a 4xx (non-429)', async () => {
    const { client, mock } = makeClient();
    mock.onGet('/v1/twitter/profile').reply(404);
    await expect(client.fetchProfile('twitter', 'dave')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });
    expect(mock.history.get.length).toBe(1);
  });

  it('retries on 429', async () => {
    const { client, mock } = makeClient();
    mock
      .onGet('/v1/twitter/profile')
      .replyOnce(429, {}, { 'retry-after': '0' })
      .onGet('/v1/twitter/profile')
      .reply(200, { followers: 5 });
    const p = await client.fetchProfile('twitter', 'eve');
    expect(p.followers).toBe(5);
  });
});
