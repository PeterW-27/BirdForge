import { makeState, restoreState } from '../domain/core.js';

export const STORAGE_KEY = 'gunters-forge-v54-demo';

const getStorage = (storage) => storage ?? globalThis.localStorage;

// test localstorage availability. Try restoring data. 
export function storageAvailable(storage = null) {
  try {
    const target = getStorage(storage);
    const probe = STORAGE_KEY + '-probe';
    target.setItem(probe, '1');
    target.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function loadState(catalog, storage = null) {
  try {
    return restoreState(JSON.parse(getStorage(storage).getItem(STORAGE_KEY)), catalog);
  } catch {
    return makeState();
  }
}

export function saveState(state, storage = null) {
  try {
    getStorage(storage).setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// try to delete website storage. 
export function resetState(storage = null) {
  try {
    getStorage(storage).removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
