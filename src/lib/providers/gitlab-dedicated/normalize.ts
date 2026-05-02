import type {
  ExternalIdentity,
  NormalizedContribution,
  RawEvent,
  SyncAdapter,
} from '../types';
import type { GitLabEvent } from './types';

const EVENT_ID_PREFIX = 'gitlab:event:';

export function externalIdFor(event: RawEvent): string {
  const payload = event.payload as GitLabEvent;
  return `${EVENT_ID_PREFIX}${payload.id}`;
}

function targetUrl(instanceUrl: string, payload: GitLabEvent): string | undefined {
  const base = instanceUrl.replace(/\/+$/, '');
  if (payload.target_type === 'MergeRequest' && payload.target_iid) {
    return `${base}/-/projects/${payload.project_id}/-/merge_requests/${payload.target_iid}`;
  }
  if (payload.target_type === 'Issue' && payload.target_iid) {
    return `${base}/-/projects/${payload.project_id}/-/issues/${payload.target_iid}`;
  }
  if (payload.target_type === 'Note' && payload.note) {
    const iid = payload.note.noteable_iid ?? payload.target_iid;
    if (payload.note.noteable_type === 'MergeRequest' && iid) {
      return `${base}/-/projects/${payload.project_id}/-/merge_requests/${iid}`;
    }
    if (payload.note.noteable_type === 'Issue' && iid) {
      return `${base}/-/projects/${payload.project_id}/-/issues/${iid}`;
    }
  }
  return undefined;
}

function pushSignal(payload: GitLabEvent): string {
  const count = payload.push_data?.commit_count ?? 1;
  const ref = payload.push_data?.ref;
  const title = payload.push_data?.commit_title?.trim();
  const commits = `${count} commit${count === 1 ? '' : 's'}`;
  if (title && ref) return `Pushed ${commits} to ${ref}: ${title}`;
  if (title) return `Pushed ${commits}: ${title}`;
  if (ref) return `Pushed ${commits} to ${ref}`;
  return `Pushed ${commits}`;
}

function commentSignal(payload: GitLabEvent): string {
  const title = payload.target_title ?? payload.note?.body ?? 'a discussion';
  return `Commented on "${title.trim().slice(0, 120)}"`;
}

export function normalize({
  event,
  identity,
}: {
  event: RawEvent;
  identity: ExternalIdentity;
}): NormalizedContribution[] {
  const payload = event.payload as GitLabEvent;
  const occurredAt = new Date(event.occurredAt);
  const externalId = externalIdFor(event);
  const externalUrl = targetUrl(identity.instanceUrl, payload);
  const action = payload.action_name;
  const targetType = payload.target_type;

  const base = {
    source: 'gitlab' as const,
    rawData: { source: 'gitlab', eventId: payload.id, projectId: payload.project_id },
    occurredAt,
    externalId,
    externalUrl,
  };

  if (action === 'pushed to' || action === 'pushed new') {
    const count = payload.push_data?.commit_count ?? 1;
    const weight = count >= 5 ? 4 : count >= 2 ? 3 : 2;
    return [
      { ...base, category: 'delivery', weight, signal: pushSignal(payload) },
    ];
  }

  if (targetType === 'MergeRequest') {
    const title = payload.target_title?.trim() ?? `MR !${payload.target_iid}`;
    if (action === 'accepted' || action === 'merged') {
      return [
        { ...base, category: 'delivery', weight: 4, signal: `Merged !${payload.target_iid}: ${title}` },
      ];
    }
    if (action === 'opened' || action === 'created') {
      return [
        { ...base, category: 'delivery', weight: 3, signal: `Opened !${payload.target_iid}: ${title}` },
      ];
    }
    if (action === 'closed') {
      return [
        { ...base, category: 'delivery', weight: 3, signal: `Closed !${payload.target_iid}: ${title}` },
      ];
    }
  }

  if (targetType === 'Issue') {
    const title = payload.target_title?.trim() ?? `Issue #${payload.target_iid}`;
    if (action === 'opened' || action === 'created') {
      return [
        { ...base, category: 'delivery', weight: 3, signal: `Opened #${payload.target_iid}: ${title}` },
      ];
    }
    if (action === 'closed') {
      return [
        { ...base, category: 'delivery', weight: 3, signal: `Closed #${payload.target_iid}: ${title}` },
      ];
    }
  }

  if (action === 'commented on' || targetType === 'Note') {
    return [
      { ...base, category: 'collaboration', weight: 2, signal: commentSignal(payload) },
    ];
  }

  return [];
}

export const gitlabSyncAdapterPart: Pick<SyncAdapter, 'normalize' | 'externalIdFor'> = {
  normalize,
  externalIdFor,
};
