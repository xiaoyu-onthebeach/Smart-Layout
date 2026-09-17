import { useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type AssetsTab = 'library' | 'yourVisuals' | 'uploads';

const TABS: { id: AssetsTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'yourVisuals', label: 'Your visuals' },
  { id: 'uploads', label: 'Uploads' },
];

/** The Library tab's own content — a brand's asset collection, broken into named folders (each
 * with its own thumbnail grid), rather than one flat pool. Reuses the existing product photos as
 * stand-ins; there's no real per-brand asset backend behind this, same as the rest of the app's
 * mocked data. */
type LibraryFolder = { id: string; name: string; images: string[] };
type LibraryCollection = { id: string; name: string; folders: LibraryFolder[] };

const LIBRARY_COLLECTIONS: LibraryCollection[] = [
  {
    id: 'lancome',
    name: 'Lancôme',
    folders: [
      {
        id: 'genifique-ultimate',
        name: 'GENIFIQUE ULTIMATE',
        images: [
          '/samples/Lancome%20banners/sample5.png',
          '/samples/Lancome%20banners/sample2.jpg',
          '/samples/Lancome%20banners/sample3.jpg',
          '/samples/Lancome%20banners/sample4.png',
          '/samples/Lancome%20banners/sample1.jpg',
        ],
      },
    ],
  },
  {
    id: 'mer-beaute',
    name: 'Mer Beauté',
    folders: [
      {
        id: 'foundation-25ml',
        name: 'FOUNDATION 25ML',
        images: ['/samples/black_1.png', '/samples/black_3.png', '/samples/beige_1.png', '/samples/beige_3.png', '/samples/beige_2.png'],
      },
      {
        id: 'lipstick',
        name: 'LIPSTICK',
        images: [
          '/samples/red_1.png',
          '/samples/red_3.png',
          '/samples/blue_1.png',
          '/samples/blue_3.png',
          '/samples/Orange_1.png',
          '/samples/Orange_2.png',
        ],
      },
    ],
  },
];

function AssetGrid({ children, empty }: { children: ReactNode; empty: boolean }) {
  const t = useT();
  if (empty) return <div className="px-1 py-6 text-center text-sm text-white/45">{t('No images to show.')}</div>;
  // A real grid (not a CSS multi-column masonry) — with an odd item count, multi-column's own
  // height-balancing can just as easily leave the last image alone in the *right* column as the
  // left one, depending on every other image's own aspect ratio. A grid always flows items
  // left-to-right, row by row, so a lone last item reliably lands in the grid's first (left) column.
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function DraggableThumb({ url, label }: { url: string; label?: string }) {
  return (
    <div
      title={label}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', url);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="block w-full cursor-grab overflow-hidden rounded-lg active:cursor-grabbing"
    >
      <img src={url} alt={label ?? ''} draggable={false} className="block w-full" />
    </div>
  );
}

/** The list-view row for one image — a small square thumb + its own filename, in place of the
 * grid view's full-width masonry tile. */
function DraggableThumbRow({ url, label }: { url: string; label: string }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', url);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="flex h-10 w-full shrink-0 cursor-grab items-center gap-2 rounded-lg px-1 transition-colors hover:bg-[#26262C] active:cursor-grabbing"
    >
      <img src={url} alt="" draggable={false} className="size-8 shrink-0 rounded-md object-cover" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-white">{label}</span>
    </div>
  );
}

/** Shared by both the collection header and each folder row below it — same height/hover/pin
 * treatment, just a different label style (bold white for a collection, dim uppercase + a count
 * pill for a folder). The pin button holds its own local "pinned" state — hidden until hovered,
 * same as before, except once clicked it swaps to the filled `pinned.svg` and stays visible on
 * the row from then on, hover or not. */
function CollapsibleRow({ expanded, onToggle, dim, children }: { expanded: boolean; onToggle: () => void; dim: boolean; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
      className="group/row flex h-8 w-full shrink-0 cursor-pointer items-center gap-1 rounded-lg px-1 transition-colors hover:bg-[#26262C]"
    >
      <span className={cn('flex size-4 shrink-0 items-center justify-center transition-colors', dim ? 'text-white/45' : 'text-white')}>
        <ChevronDown className={cn('size-3 transition-transform', !expanded && '-rotate-90')} />
      </span>
      {children}
      <button
        type="button"
        aria-label={pinned ? 'Unpin' : 'Pin'}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((v) => !v);
        }}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-lg text-white/70 transition-opacity hover:text-white',
          pinned ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
        )}
      >
        <img src={pinned ? '/icons/pinned.svg' : '/icons/pin.svg'} alt="" className="size-4" />
      </button>
    </div>
  );
}

function FolderSection({ folder, view }: { folder: LibraryFolder; view: 'grid' | 'list' }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="flex w-full flex-col">
      <CollapsibleRow expanded={expanded} onToggle={() => setExpanded((v) => !v)} dim={!expanded}>
        {/* Name and count badge sit together, 8px apart, left-aligned as one group — a trailing
            flex-1 spacer (not the name itself) is what pushes the pin button to the row's far
            right, so the badge stays right next to the name instead of drifting to the end. */}
        <span className="flex min-w-0 shrink items-center gap-2">
          <span className={cn('min-w-0 truncate text-[11px] tracking-[-0.01em] uppercase', expanded ? 'text-white' : 'text-white/45')}>
            {folder.name}
          </span>
          <span
            className="flex h-4 shrink-0 items-center justify-center rounded-full border px-2 text-[11px] text-white"
            style={{ background: '#26262C', borderColor: '#40404A' }}
          >
            {folder.images.length}
          </span>
        </span>
        <span className="min-w-0 flex-1" />
      </CollapsibleRow>
      {expanded &&
        (view === 'grid' ? (
          <div className="px-1 pt-1 pb-2">
            <AssetGrid empty={folder.images.length === 0}>
              {folder.images.map((url) => (
                <DraggableThumb key={url} url={url} label={folder.name} />
              ))}
            </AssetGrid>
          </div>
        ) : (
          <div className="flex flex-col pb-1">
            {folder.images.map((url, i) => (
              <DraggableThumbRow key={url} url={url} label={`${folder.name} ${i + 1}`} />
            ))}
          </div>
        ))}
    </div>
  );
}

function CollectionSection({ collection, view }: { collection: LibraryCollection; view: 'grid' | 'list' }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="flex w-full flex-col">
      <CollapsibleRow expanded={expanded} onToggle={() => setExpanded((v) => !v)} dim={!expanded}>
        <span className={cn('min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]', expanded ? 'text-white' : 'text-white/45')}>
          {collection.name}
        </span>
      </CollapsibleRow>
      {expanded && (
        <div className="flex flex-col">
          {collection.folders.map((folder) => (
            <FolderSection key={folder.id} folder={folder} view={view} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Left panel's Assets card: a Library/Your visuals/Uploads switcher, a search box, and a
 * scrollable image grid below — drag any image onto a banner frame on the canvas to add it as a
 * new image layer there. Library's own content is organized into a brand collection of named
 * folders (see `LIBRARY_COLLECTIONS`) rather than one flat pool. */
export function AssetsPanel() {
  const t = useT();
  const uploadedAssetUrls = useAppStore((s) => s.uploadedAssetUrls);
  const [tab, setTab] = useState<AssetsTab>('library');
  const [query, setQuery] = useState('');
  const [libraryView, setLibraryView] = useState<'grid' | 'list'>('grid');

  const q = query.trim().toLowerCase();
  const filteredCollections = !q
    ? LIBRARY_COLLECTIONS
    : LIBRARY_COLLECTIONS.map((collection) => ({
        ...collection,
        folders: collection.folders
          .map((folder) => ({ ...folder, images: folder.name.toLowerCase().includes(q) ? folder.images : [] }))
          .filter((folder) => folder.images.length > 0 || folder.name.toLowerCase().includes(q)),
      })).filter((collection) => collection.folders.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border-[0.5px] p-2" style={{ background: '#19191D', borderColor: '#26262C' }}>
      <div className="flex h-8 w-full shrink-0 items-center p-1">
        <div className="flex h-6 flex-1 items-center rounded-md">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex h-6 shrink-0 items-center justify-center rounded-lg px-3 text-[11px] font-semibold tracking-[-0.01em] uppercase transition-colors',
                tab === item.id
                  ? 'text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)]'
                  : 'text-white/65 hover:text-white/85',
              )}
              style={tab === item.id ? { background: '#26262C' } : undefined}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      </div>

      {tab !== 'uploads' && (
        <div className="flex h-8 shrink-0 items-center gap-2">
          <div className="flex h-8 flex-1 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
            <Search className="size-4 shrink-0 text-white/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(tab === 'yourVisuals' ? 'Search visuals' : 'Search an asset')}
              className="w-full min-w-0 bg-transparent text-[13px] text-chrome-fg placeholder:text-white/25 outline-none"
            />
          </div>
          {tab === 'library' && (
            <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-md p-0">
              <button
                type="button"
                aria-label={t('Grid view')}
                onClick={() => setLibraryView('grid')}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                  libraryView === 'grid' ? 'text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]' : 'text-white/45 hover:text-white/70',
                )}
                style={libraryView === 'grid' ? { background: '#26262C' } : undefined}
              >
                <img src="/icons/grid.svg" alt="" className="size-4" />
              </button>
              <button
                type="button"
                aria-label={t('List view')}
                onClick={() => setLibraryView('list')}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                  libraryView === 'list' ? 'text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]' : 'text-white/45 hover:text-white/70',
                )}
                style={libraryView === 'list' ? { background: '#26262C' } : undefined}
              >
                <img src="/icons/line%20view.svg" alt="" className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'library' &&
          (filteredCollections.length === 0 ? (
            <div className="px-1 py-6 text-center text-sm text-white/45">{t('No images to show.')}</div>
          ) : (
            <div className="flex flex-col gap-1">
              {filteredCollections.map((collection) => (
                <CollectionSection key={collection.id} collection={collection} view={libraryView} />
              ))}
            </div>
          ))}

        {tab === 'yourVisuals' && <AssetGrid empty>{null}</AssetGrid>}

        {tab === 'uploads' && (
          <AssetGrid empty={uploadedAssetUrls.length === 0}>
            {uploadedAssetUrls.map((url) => (
              <DraggableThumb key={url} url={url} />
            ))}
          </AssetGrid>
        )}
      </div>
    </div>
  );
}
