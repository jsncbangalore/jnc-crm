/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export type CrossTabAuthEvent =
  | { type: 'signed_in'; userId: string; portal?: 'staff' | 'platform'; timestamp: number }
  | { type: 'signed_out'; timestamp: number }
  | { type: 'session_changed'; userId?: string; timestamp: number }
  | { type: 'token_refreshed'; portal: 'staff' | 'platform'; accessToken: string; userId: string; timestamp: number };

const CHANNEL_NAME = 'crm_auth_channel';
const STORAGE_EVENT_KEY = 'crm_cross_tab_auth_event';
const LOCK_NAME_PREFIX = 'crm_refresh_lock_';
const TOKEN_CACHE_WINDOW_MS = 5000;

// In-memory token cache (tokens are NEVER stored in localStorage or sessionStorage)
const _inMemoryRecentTokens: Record<string, { accessToken: string; userId: string; timestamp: number }> = {};

export function getInMemoryRecentToken(
  portal: 'staff' | 'platform',
  expectedUserId?: string | null,
): { accessToken: string; userId: string } | null {
  const item = _inMemoryRecentTokens[portal];
  if (!item?.accessToken || !item?.timestamp) return null;

  if (Date.now() - item.timestamp > TOKEN_CACHE_WINDOW_MS) {
    delete _inMemoryRecentTokens[portal];
    return null;
  }

  if (expectedUserId && item.userId && item.userId !== expectedUserId) {
    return null;
  }

  return { accessToken: item.accessToken, userId: item.userId };
}

/**
 * Broadcast an authentication event to all other tabs in this browser.
 * Tokens move between tabs ONLY via BroadcastChannel messages in memory.
 * The storage-event fallback NEVER carries tokens (only event type, user id and timestamp).
 */
export function broadcastCrossTabEvent(event: CrossTabAuthEvent): void {
  if (typeof window === 'undefined') return;

  // 1. BroadcastChannel (primary - moves tokens exclusively in memory)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(event);
      channel.close();
    } catch {
      // Fallback to storage event
    }
  }

  // 2. Storage event fallback - STRICT SECURITY RULE: NEVER write access or refresh tokens to storage!
  // Fallback carries only event type and user id
  try {
    const safePayload = {
      type: event.type,
      userId: 'userId' in event ? event.userId : undefined,
      portal: 'portal' in event ? event.portal : undefined,
      timestamp: event.timestamp,
      _t: Date.now(),
    };
    localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(safePayload));
  } catch {
    // Ignore storage quota / privacy exceptions
  }
}

export function broadcastSignIn(userId: string, portal?: 'staff' | 'platform'): void {
  broadcastCrossTabEvent({
    type: 'signed_in',
    userId,
    portal,
    timestamp: Date.now(),
  });
}

export function broadcastSignOut(): void {
  broadcastCrossTabEvent({
    type: 'signed_out',
    timestamp: Date.now(),
  });
}

export function broadcastSessionChanged(userId?: string): void {
  broadcastCrossTabEvent({
    type: 'session_changed',
    userId,
    timestamp: Date.now(),
  });
}

export function broadcastTokenRefreshed(
  portal: 'staff' | 'platform',
  accessToken: string,
  userId: string,
): void {
  // Store strictly in memory
  _inMemoryRecentTokens[portal] = { accessToken, userId, timestamp: Date.now() };

  // Broadcast in-memory via BroadcastChannel
  broadcastCrossTabEvent({
    type: 'token_refreshed',
    portal,
    accessToken,
    userId,
    timestamp: Date.now(),
  });
}

/**
 * Subscribe to cross-tab auth events.
 */
export function subscribeCrossTabAuth(listener: (event: CrossTabAuthEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (msgEvent) => {
        if (msgEvent.data && typeof msgEvent.data === 'object' && msgEvent.data.type) {
          const ev = msgEvent.data as CrossTabAuthEvent;
          if (ev.type === 'token_refreshed' && ev.accessToken) {
            _inMemoryRecentTokens[ev.portal] = {
              accessToken: ev.accessToken,
              userId: ev.userId,
              timestamp: ev.timestamp || Date.now(),
            };
          }
          listener(ev);
        }
      };
    } catch {
      channel = null;
    }
  }

  const handleStorage = (storageEvent: StorageEvent) => {
    if (storageEvent.key === STORAGE_EVENT_KEY && storageEvent.newValue) {
      try {
        const parsed = JSON.parse(storageEvent.newValue);
        if (parsed && parsed.type) {
          listener(parsed as CrossTabAuthEvent);
        }
      } catch {
        // ignore
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    if (channel) {
      channel.close();
    }
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Acquire a cross-tab lock for token refresh.
 * Uses Web Locks API (navigator.locks) if available, with a storage-based mutex fallback when missing.
 * Neither mechanism stores tokens in storage.
 * If another tab just refreshed the token via BroadcastChannel in memory within the last 5s,
 * returns the fresh token immediately.
 */
export async function acquireCrossTabRefreshLock(
  portal: 'staff' | 'platform',
  expectedUserId: string | null | undefined,
  refreshFn: () => Promise<any>,
): Promise<any> {
  const lockKey = LOCK_NAME_PREFIX + portal;

  // 1. Web Locks API
  if (
    typeof navigator !== 'undefined' &&
    'locks' in navigator &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    return navigator.locks.request(lockKey, async () => {
      // Check in-memory token cache (populated via BroadcastChannel)
      const recent = getInMemoryRecentToken(portal, expectedUserId);
      if (recent) {
        return {
          data: {
            accessToken: recent.accessToken,
            user: { id: recent.userId },
            _dedupedAcrossTabs: true,
          },
        };
      }

      const res = await refreshFn();
      if (res?.data?.accessToken) {
        const uid = res.data?.user?.id || expectedUserId || '';
        broadcastTokenRefreshed(portal, res.data.accessToken, uid);
      }
      return res;
    });
  }

  // 2. Storage-based mutex fallback when navigator.locks is missing/disabled
  // STRICT RULE: Storage value contains ONLY lock metadata (holderId, acquiredAt, expiresAt) — NEVER tokens!
  const lockStorageKey = 'crm_lock_' + portal;
  const holderId = 'tab_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  const acquireTimeout = Date.now() + 10000;
  const lockHoldDuration = 8000;

  while (Date.now() < acquireTimeout) {
    const rawVal = localStorage.getItem(lockStorageKey);
    let lockHolder: { holderId: string; expiresAt: number } | null = null;
    if (rawVal) {
      try {
        lockHolder = JSON.parse(rawVal);
      } catch {
        // legacy timestamp support
        const ts = parseInt(rawVal, 10);
        if (!isNaN(ts)) {
          lockHolder = { holderId: 'legacy', expiresAt: ts + lockHoldDuration };
        }
      }
    }

    const now = Date.now();
    if (!lockHolder || now > (lockHolder.expiresAt || 0)) {
      try {
        localStorage.setItem(
          lockStorageKey,
          JSON.stringify({ holderId, acquiredAt: now, expiresAt: now + lockHoldDuration }),
        );
        // Small jitter check to verify we didn't race another tab
        await new Promise((r) => setTimeout(r, 20));
        const checkVal = localStorage.getItem(lockStorageKey);
        if (checkVal) {
          const parsed = JSON.parse(checkVal);
          if (parsed.holderId === holderId) {
            break; // Lock successfully acquired
          }
        }
      } catch {
        // ignore
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  try {
    // Check in-memory token cache (populated via BroadcastChannel)
    const recent = getInMemoryRecentToken(portal, expectedUserId);
    if (recent) {
      return {
        data: {
          accessToken: recent.accessToken,
          user: { id: recent.userId },
          _dedupedAcrossTabs: true,
        },
      };
    }
    const res = await refreshFn();
    if (res?.data?.accessToken) {
      const uid = res.data?.user?.id || expectedUserId || '';
      broadcastTokenRefreshed(portal, res.data.accessToken, uid);
    }
    return res;
  } finally {
    try {
      const checkVal = localStorage.getItem(lockStorageKey);
      if (checkVal) {
        const parsed = JSON.parse(checkVal);
        if (parsed.holderId === holderId) {
          localStorage.removeItem(lockStorageKey);
        }
      }
    } catch {
      localStorage.removeItem(lockStorageKey);
    }
  }
}
