export interface PullRequestStatus {
  state: string;
  url: string;
}

interface GitHubPullRequestResponse {
  head: { sha: string };
  html_url: string;
}

interface GitHubCommitStatusResponse {
  state: string;
}

/**
 * Fetches the build status for a pull request using the GitHub API.
 * This returns the combined commit status for the PR's head SHA.
 */
export async function getPullRequestBuildStatus(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<PullRequestStatus> {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'codex-ci-checker',
  };

  const prRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers }
  );
  if (!prRes.ok) {
    throw new Error(`Failed to fetch PR: ${prRes.status}`);
  }
  const prData: GitHubPullRequestResponse = await prRes.json();
  const sha = prData.head.sha;

  const statusRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`,
    { headers }
  );
  if (!statusRes.ok) {
    throw new Error(`Failed to fetch status: ${statusRes.status}`);
  }
  const statusData: GitHubCommitStatusResponse = await statusRes.json();
  return {
    state: statusData.state,
    url: prData.html_url,
  };
}
