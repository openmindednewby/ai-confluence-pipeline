/**
 * The 3-way classifier — the safety core. Given the agreed **base** (last sync), the current **local**,
 * and the current **remote**, decide what a sync run should do. This is what guarantees "never silently
 * lose an edit": when BOTH sides changed to different values it returns `conflict` and the executor
 * applies nothing. Pure + total.
 */
import { recordsEqual, type SyncRecord } from './model.js';

export const enum SyncAction {
  Skip = 'skip', // neither side changed
  Push = 'push', // local changed, remote unchanged → write local → remote
  Pull = 'pull', // remote changed, local unchanged → write remote → local
  Converged = 'converged', // both changed to the SAME value → just re-baseline
  Conflict = 'conflict', // both changed to DIFFERENT values → flag, apply nothing
}

/** Classify one record from its three versions. `base` null = no prior sync (handled by the planner). */
export function classify(base: SyncRecord, local: SyncRecord, remote: SyncRecord): SyncAction {
  const localChanged = !recordsEqual(local, base);
  const remoteChanged = !recordsEqual(remote, base);
  if (!localChanged && !remoteChanged) return SyncAction.Skip;
  if (localChanged && !remoteChanged) return SyncAction.Push;
  if (!localChanged && remoteChanged) return SyncAction.Pull;
  // both changed
  return recordsEqual(local, remote) ? SyncAction.Converged : SyncAction.Conflict;
}

/** Field-level diff between two records — which fields differ (for conflict reports + future field-merge). */
export function changedFields(a: SyncRecord, b: SyncRecord): Array<keyof SyncRecord> {
  const out: Array<keyof SyncRecord> = [];
  if (a.title.trim() !== b.title.trim()) out.push('title');
  if (a.body.trim() !== b.body.trim()) out.push('body');
  if (a.status !== b.status) out.push('status');
  if (!recordsEqual({ ...a, title: b.title, body: b.body, status: b.status }, b)) out.push('labels');
  return out;
}
