/**
 * GitLab API shapes the provider consumes. These do not leak outside the
 * provider folder — `RawEvent.payload` is `unknown` to the orchestrator.
 */

export type GitLabUser = {
  id: number;
  username: string;
  name?: string;
  email?: string;
  state?: string;
  web_url?: string;
};

export type GitLabPushData = {
  commit_count: number;
  action: string;
  ref_type: string;
  ref?: string;
  commit_title?: string;
};

export type GitLabNote = {
  id: number;
  body: string;
  noteable_type: string;
  noteable_iid?: number;
};

export type GitLabEvent = {
  id: number;
  project_id: number;
  action_name: string;
  target_type: string | null;
  target_id?: number | null;
  target_iid?: number | null;
  target_title?: string | null;
  created_at: string;
  push_data?: GitLabPushData;
  note?: GitLabNote;
  author: { id: number; username: string; name: string };
};

export type GitLabSyncCursor = {
  cursorVersion: number;
  eventsAfter: string | null;
  page?: number;
};

export const GITLAB_CURSOR_VERSION = 1;
