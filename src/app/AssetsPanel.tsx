import { useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { SAMPLE_IMAGES } from '@/lib/sample-images';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type AssetsTab = 'library' | 'yourVisuals' | 'uploads';

const TABS: { id: AssetsTab; label: string }[] = [
  { id: 'library', label: 'Library' },
  { id: 'yourVisuals', label: 'Your visuals' },
  { id: 'uploads', label: 'Uploads' },
];

function AssetGrid({ children, empty }: { children: ReactNode; empty: boolean }) {
  const t = useT();
  if (empty) return <div className="px-1 py-6 text-center text-sm text-white/45">{t('No images to show.')}</div>;
  return <div className="columns-2 gap-2">{children}</div>;
}

/** Left panel's Assets card: a Library/Your visuals/Uploads switcher, a search box, and a
 * scrollable image grid below — drag any image onto a banner frame on the canvas to add it as a
 * new image layer there. */
export function AssetsPanel() {
  const t = useT();
  const uploadedAssetUrls = useAppStore((s) => s.uploadedAssetUrls);
  const [tab, setTab] = useState<AssetsTab>('library');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const libraryItems = SAMPLE_IMAGES.filter((item) => !q || item.label.toLowerCase().includes(q));

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
        <div className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
          <Search className="size-4 text-white/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(tab === 'yourVisuals' ? 'Search visuals' : 'Search assets')}
            className="w-full bg-transparent text-sm text-chrome-fg placeholder:text-white/25 outline-none"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'library' && (
          <AssetGrid empty={libraryItems.length === 0}>
            {libraryItems.map((item) => (
              <div
                key={item.file}
                title={item.label}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.url);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="mb-2 block w-full cursor-grab overflow-hidden rounded-lg active:cursor-grabbing"
                style={{ breakInside: 'avoid' }}
              >
                <img src={item.url} alt={item.label} draggable={false} className="block w-full" />
              </div>
            ))}
          </AssetGrid>
        )}

        {tab === 'yourVisuals' && <AssetGrid empty>{null}</AssetGrid>}

        {tab === 'uploads' && (
          <AssetGrid empty={uploadedAssetUrls.length === 0}>
            {uploadedAssetUrls.map((url) => (
              <div
                key={url}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', url);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="mb-2 block w-full cursor-grab overflow-hidden rounded-lg active:cursor-grabbing"
                style={{ breakInside: 'avoid' }}
              >
                <img src={url} alt="" draggable={false} className="block w-full" />
              </div>
            ))}
          </AssetGrid>
        )}
      </div>
    </div>
  );
}
