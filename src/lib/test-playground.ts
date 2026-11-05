import { useAppStore } from '@/store/useAppStore';
import type { AppState } from '@/store/types';

// A testing shortcut, not a product feature: snapshot whatever banners are on the playground right
// now, and bring that exact set back later in one click (see TestDataButton). Saved either in this
// browser (IndexedDB rather than localStorage — banners with uploaded images can easily outgrow
// localStorage's ~5MB) or into the project itself, as PROJECT_FILE, committed so every browser
// and every teammate gets the same set.

/** The shared test set, in `public/` — written by the dev server (see vite.config.ts). */
const PROJECT_FILE = '/test-playground.json';
const PROJECT_FILE_WRITE_URL = '/__test-playground';

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

/** Saved images are no larger than this on their longest side — plenty for any banner, and the
 * full-size originals (several MB each, drawn in every banner, thumbnail and preview) made the app
 * lag once loaded. */
const SAVED_IMAGE_MAX_SIDE = 1600;

/** An uploaded image, scaled down to SAVED_IMAGE_MAX_SIDE if it's bigger and re-encoded as WebP
 * (which keeps transparency) — as is if the browser can't. */
async function shrinkImage(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, SAVED_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const shrunk = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
    return shrunk.size < blob.size ? shrunk : blob;
  } catch {
    return blob;
  }
}

/** Images embedded as data URLs beyond this length (about 1MB) are shrunk too — saves made before
 * images were shrunk on saving. */
const OVERSIZED_DATA_URL_LENGTH = 1_000_000;

/** `blob:` URLs (uploaded images) only live as long as the tab — swapped for data URLs (of the
 * shrunk image, see shrinkImage) so the saved banners still have their images after a reload.
 * Oversized data URLs are shrunk the same way. */
async function inlineBlobUrls(layoutsById: Snapshot['layoutsById']): Promise<Snapshot['layoutsById']> {
  const cache = new Map<string, Promise<string>>();
  const toDataUrl = (url: string) => {
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url)
          .then((res) => res.blob())
          .then(shrinkImage)
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
    if (typeof value === 'string') {
      const inline = value.startsWith('blob:') || (value.startsWith('data:image/') && value.length > OVERSIZED_DATA_URL_LENGTH);
      return inline ? toDataUrl(value).catch(() => value) : value;
    }
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === 'object') {
      const entries = await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await walk(v)] as const));
      return Object.fromEntries(entries);
    }
    return value;
  };
  return (await walk(layoutsById)) as Snapshot['layoutsById'];
}

async function currentSnapshot(): Promise<Snapshot> {
  const state = useAppStore.getState();
  const snapshot = {} as Snapshot;
  for (const key of SAVED_KEYS) snapshot[key] = state[key] as never;
  snapshot.layoutsById = await inlineBlobUrls(snapshot.layoutsById);
  return snapshot;
}

export async function saveTestPlayground(): Promise<void> {
  const snapshot = await currentSnapshot();
  await withStore('readwrite', (store) => store.put(snapshot, KEY));
}

/** Writes the current banners into the project (PROJECT_FILE) — only while running the dev server. */
export async function saveTestPlaygroundToProject(): Promise<void> {
  const res = await fetch(PROJECT_FILE_WRITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await currentSnapshot()) });
  if (!res.ok) throw new Error(`Saving to the project failed (${res.status})`);
}

async function projectSnapshot(): Promise<Snapshot | undefined> {
  try {
    const res = await fetch(PROJECT_FILE, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return undefined;
    return (await res.json()) as Snapshot;
  } catch {
    return undefined;
  }
}

/** Whether there's a set to load — saved in this browser, or in the project. */
export async function hasSavedTestPlayground(): Promise<boolean> {
  const inBrowser = await withStore('readonly', (store) => store.count(KEY)).catch(() => 0);
  return inBrowser > 0 || Boolean(await projectSnapshot());
}

/** Replaces the playground with the saved banners and opens the editor on them. Returns false when
 * nothing was saved yet. */
export async function loadTestPlayground(): Promise<boolean> {
  // This browser's own save first; otherwise the set committed to the project.
  const saved = await withStore<Snapshot | undefined>('readonly', (store) => store.get(KEY)).catch(() => undefined);
  const snapshot = saved ?? (await projectSnapshot());
  if (!snapshot) return false;
  // Full-size images from an older save would make the app lag: shrunk on the way in, and this
  // browser's save updated so it only happens once.
  const layoutsById = await inlineBlobUrls(snapshot.layoutsById);
  if (saved && JSON.stringify(layoutsById) !== JSON.stringify(snapshot.layoutsById)) {
    await withStore('readwrite', (store) => store.put({ ...saved, layoutsById }, KEY)).catch(() => undefined);
  }
  snapshot.layoutsById = layoutsById;
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
