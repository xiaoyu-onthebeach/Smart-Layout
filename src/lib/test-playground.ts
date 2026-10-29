import { useAppStore } from '@/store/useAppStore';
import type { AppState } from '@/store/types';

// A testing shortcut, not a product feature: snapshot whatever banners are on the playground right
// now, and bring that exact set back later in one click (see TestDataButton). Stored in IndexedDB
// rather than localStorage — banners with uploaded images can easily outgrow localStorage's ~5MB.

/** Everything that makes up the playground's banners and how they're arranged on the canvas. */
const SAVED_KEYS = [
  'layoutsById',
  'setsById',
  'pageOrder',
  'pagePositions',
  'pageGroups',
  'pageGroupIdByPage',
  'canvasRootByPage',
  'canvasRootOrder',
  'activeCanvasRootId',
  'currentSet',
] as const;
type Snapshot = Pick<AppState, (typeof SAVED_KEYS)[number]>;

const DB_NAME = 'layout-test-playground';
const STORE = 'snapshots';
const KEY = 'saved';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** `blob:` URLs (uploaded images) only live as long as the tab — swapped for data URLs so the
 * saved banners still have their images after a reload. */
async function inlineBlobUrls(layoutsById: Snapshot['layoutsById']): Promise<Snapshot['layoutsById']> {
  const cache = new Map<string, Promise<string>>();
  const toDataUrl = (url: string) => {
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url)
          .then((res) => res.blob())
          .then(
            (blob) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
              }),
          ),
      );
    }
    return cache.get(url)!;
  };
  // Every string field anywhere in a layout, so any image property (fills, backgrounds...) is covered.
  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') return value.startsWith('blob:') ? toDataUrl(value).catch(() => value) : value;
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === 'object') {
      const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await walk(v)] as const));
      return Object.fromEntries(entries);
    }
    return value;
  };
  return (await walk(layoutsById)) as Snapshot['layoutsById'];
}

export async function saveTestPlayground(): Promise<void> {
  const state = useAppStore.getState();
  const snapshot = {} as Snapshot;
  for (const key of SAVED_KEYS) snapshot[key] = state[key] as never;
  snapshot.layoutsById = await inlineBlobUrls(snapshot.layoutsById);
  await withStore('readwrite', (store) => store.put(snapshot, KEY));
}

export async function hasSavedTestPlayground(): Promise<boolean> {
  return (await withStore('readonly', (store) => store.count(KEY))) > 0;
}

/** Replaces the playground with the saved banners and opens the editor on them. Returns false when
 * nothing was saved yet. */
export async function loadTestPlayground(): Promise<boolean> {
  const snapshot = await withStore<Snapshot | undefined>('readonly', (store) => store.get(KEY));
  if (!snapshot) return false;
  const firstPage = snapshot.pageOrder[0];
  const firstSet = firstPage ? snapshot.setsById[firstPage] : undefined;
  useAppStore.setState({
    ...snapshot,
    activeLayoutId: firstSet?.sourceLayoutId ?? null,
    selectedSceneIds: [],
    selectedElements: [],
    selectedGroupId: null,
    viewAllActivePageId: null,
    editingTextElementId: null,
    editingVectorElementId: null,
    loadingPageIds: {},
    pendingCascadeSetIds: {},
  });
  useAppStore.getState().goTo('editor');
  // Frames the first banner, as if it had just been created — the camera is wherever the previous
  // playground left it otherwise.
  if (firstPage) setTimeout(() => useAppStore.getState().requestFocusPage(firstPage), 100);
  return true;
}
