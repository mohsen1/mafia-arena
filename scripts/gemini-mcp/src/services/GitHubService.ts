import { GH_ACCESS_TOKEN, GITHUB_REPO, GITHUB_API_BASE } from '../config/index.js';
import { GitHubIssue } from '../types.js';
import { logger } from './LoggerService.js';

/**
 * Service that handles all GitHub API interactions.
 * Encapsulates authentication and API calls.
 */
export class GitHubService {
  private readonly headers: Record<string, string>;
  
  constructor() {
    this.headers = {
      'Accept': 'application/vnd.github.v3+json',
      ...(GH_ACCESS_TOKEN && { 'Authorization': `Bearer ${GH_ACCESS_TOKEN}` }),
    };
    
    if (!GH_ACCESS_TOKEN) {
      logger.warn('GitHub service initialized without access token - functionality will be limited');
    }
  }

  /**
   * Fetch open issues from the repository
   */
  async fetchOpenIssues(): Promise<GitHubIssue[]> {
    if (!GH_ACCESS_TOKEN) {
      logger.info('Skipping GitHub issues fetch - no access token');
      return [];
    }

    logger.info(`Fetching open issues from ${GITHUB_REPO}...`);
    
    try {
      const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/issues?state=open&sort=updated&direction=desc`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      const issues = await response.json() as GitHubIssue[];
      
      // Filter out pull requests (they appear in issues API)
      const realIssues = issues.filter((issue: any) => !('pull_request' in issue));
      
      logger.info(`Fetched ${realIssues.length} open issues from GitHub`);
      return realIssues;
    } catch (error) {
      logger.error('Failed to fetch GitHub issues:', error);
      return [];
    }
  }

  /**
   * Close a GitHub issue
   */
  async closeIssue(issueNumber: number): Promise<boolean> {
    if (!GH_ACCESS_TOKEN) {
      logger.warn(`Cannot close issue #${issueNumber} - no access token`);
      return false;
    }

    logger.info(`Closing GitHub issue #${issueNumber}...`);
    
    try {
      const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO}/issues/${issueNumber}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed' }),
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      
      logger.info(`Successfully closed GitHub issue #${issueNumber}`);
      return true;
    } catch (error) {
      logger.error(`Failed to close GitHub issue #${issueNumber}:`, error);
      return false;
    }
  }

  /**
   * Format GitHub issues for inclusion in prompts
   */
  formatIssuesForPrompt(issues: GitHubIssue[]): string {
    if (issues.length === 0) {
      return 'No open GitHub issues found.';
    }
    
    const formatted = issues.slice(0, 10).map((issue, index) => {
      const labels = issue.labels.map(l => l.name).join(', ');
      const body = issue.body 
        ? issue.body.substring(0, 200) + (issue.body.length > 200 ? '...' : '') 
        : 'No description';
      
      return `${index + 1}. Issue #${issue.number}: ${issue.title}
   Labels: ${labels || 'none'}
   URL: ${issue.html_url}
   Description: ${body}`;
    }).join('\n\n');
    
    return `OPEN GITHUB ISSUES (prioritize these):
${formatted}

Note: After completing an issue, it will be automatically closed on GitHub.`;
  }

  /**
   * Extract issue number from instruction text
   */
  extractIssueNumber(text: string): number | undefined {
    const patterns = [
      /Issue #(\d+)/i,
      /#(\d+)/,
      /GitHub issue (\d+)/i,
      /Fix issue (\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const issueNumber = parseInt(match[1], 10);
        if (!isNaN(issueNumber)) {
          logger.info(`Extracted GitHub issue number: ${issueNumber}`);
          return issueNumber;
        }
      }
    }
    
    return undefined;
  }
} 