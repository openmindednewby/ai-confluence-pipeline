/**
 * Sync-state store — the per-record memory that makes 3-way sync possible. For each binding it holds,
 * keyed by local record path: the linked remote id, the remote revision seen at last sync, and the
 * **base** snapshot (the agreed `SyncRecord` both sides shared then). Lives at `.acp/sync/state.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SyncRecord } from './model.js';

export interface RecordState {
  remoteId: string;
  remoteRev: string;
  base: SyncRecord; // the 3-way base
  lastSyncedAt?: string;
}

export interface SyncState {
  version: 1;
  bindings: Record<string, { records: Record<string, RecordState> }>;
}

export function syncStatePath(baseDir: string): string {
  return join(baseDir, '.acp', 'sync', 'state.json');
}

export function emptyState(): SyncState {
  return { version: 1, bindings: {} };
}

export function loadState(path: string): SyncState {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as SyncState;
    if (data && data.version === 1 && data.bindings) return data;
  } catch {
    /* missing / unreadable → fresh */
  }
  return emptyState();
}

export function saveState(path: string, state: SyncState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** The record map for a binding (created empty if absent). */
export function bindingRecords(state: SyncState, bindingId: string): Record<string, RecordState> {
  if (!state.bindings[bindingId]) state.bindings[bindingId] = { records: {} };
  return state.bindings[bindingId].records;
}

/** Conflict files live beside the state: `.acp/sync/conflicts/<binding>/<safeId>.md`. */
export function conflictPath(baseDir: string, bindingId: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(baseDir, '.acp', 'sync', 'conflicts', bindingId, `${safe}.md`);
}

export function hasConflictsDir(baseDir: string): boolean {
  return existsSync(join(baseDir, '.acp', 'sync', 'conflicts'));
}
