/**
 * Customer data must not sit on the disk of a shared PC. The CRM screens cache their lists under keys that start
 * with "crm_" in localStorage. This guard keeps every such key in sessionStorage instead (gone when the tab closes)
 * and wipes it at sign-out. Install it before anything else runs.
 */
const PREFIX = 'crm_';
const isCrm = (k: string) => k.startsWith(PREFIX);

export function installStorageGuard() {
  try {
    const proto = Storage.prototype;
    const get = proto.getItem, set = proto.setItem, remove = proto.removeItem;
    const lsKey = proto.key, lsLen = Object.getOwnPropertyDescriptor(proto, 'length')!.get!;
    proto.getItem = function (this: Storage, k: string) {
      return this === localStorage && isCrm(String(k)) ? get.call(sessionStorage, k) : get.call(this, k);
    };
    proto.setItem = function (this: Storage, k: string, v: string) {
      if (this === localStorage && isCrm(String(k))) {
        try { set.call(sessionStorage, k, v); } catch { /* quota: the in-memory copy in crmService stays valid */ }
        return;
      }
      set.call(this, k, v);
    };
    proto.removeItem = function (this: Storage, k: string) {
      if (this === localStorage && isCrm(String(k))) { remove.call(sessionStorage, k); return; }
      remove.call(this, k);
    };
    // old versions stored these in localStorage: remove what is already there
    const stale: string[] = [];
    for (let i = 0; i < lsLen.call(localStorage); i++) {
      const k = lsKey.call(localStorage, i);
      if (k && isCrm(k)) stale.push(k);
    }
    stale.forEach((k) => remove.call(localStorage, k));
  } catch { /* storage not available: nothing to protect */ }
}

export function wipeCrmCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && isCrm(k)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}
