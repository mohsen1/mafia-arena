/**
 * Shared TypeScript interfaces used across the Gemini MCP refactor.
 *
 * NOTE: Keep this file **dependency-free** so it can be imported from any
 * module without causing circular dependencies.
 */

// -------------------------------------------------------------------------------------
// Backlog & Task Management
// -------------------------------------------------------------------------------------

export interface BacklogItem {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: number;
  createdAt: string; // ISO string
  deps: string[];
  /** The GitHub issue this task is linked to. Can be undefined for self-generated plans. */
  githubIssueNumber?: number;
  /** The instruction for this specific step. */
  instruction: string;
}

// -------------------------------------------------------------------------------------
// GitHub
// -------------------------------------------------------------------------------------

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
}

// -------------------------------------------------------------------------------------
// Prompt History
// -------------------------------------------------------------------------------------

export interface PromptHistoryEntry {
  timestamp: string; // ISO string
  prompt: string;
  iteration: number;
}

// -------------------------------------------------------------------------------------
// Structured Action Plan from Gemini
// -------------------------------------------------------------------------------------

export interface ActionPlan {
  /** A brief, one-sentence summary of the plan */
  title: string;

  /** Gemini's reasoning for choosing this task. Logged for traceability */
  reasoning: string;

  /** The precise instruction string that should be typed into Cursor's chat */
  instruction_for_cursor: string;

  /** Associated GitHub issue number, if any */
  github_issue_number?: number;

  /** Whether Cursor should perform a git commit after completing this task */
  perform_commit: boolean;

  /** Proposed commit message (required if perform_commit is true) */
  commit_message?: string;
}

/** A high-level objective, like a GitHub issue or self-generated goal */
export interface Objective {
  title: string;
  githubIssueNumber?: number;
  description: string;
} 