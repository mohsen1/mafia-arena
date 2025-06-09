import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPullRequestBuildStatus } from '../getPrStatus';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('getPullRequestBuildStatus', () => {
  it('fetches PR and commit status from GitHub', async () => {
    const fetchMock = vi.fn();
    (globalThis as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ head: { sha: 'abc123' }, html_url: 'url' }),
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: 'success' }),
    });

    const result = await getPullRequestBuildStatus('owner', 'repo', 1, 'token');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.github.com/repos/owner/repo/pulls/1',
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/owner/repo/commits/abc123/status',
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result).toEqual({ state: 'success', url: 'url' });
  });
});
