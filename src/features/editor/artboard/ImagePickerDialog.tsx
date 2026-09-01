import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import { SAMPLE_IMAGES } from '@/lib/sample-images';

type TabId = 'visuals' | 'upload';

// Tile (134px) + gap (16px) at the dialog's 736px content width fits exactly 5 per row.
const GRID_COLUMNS = 5;
const GRID_ROWS = 3;
const GRID_SIZE = GRID_COLUMNS * GRID_ROWS;

/** Cycles `items` to produce exactly `count` entries, repeating as needed to fill the grid. */
function fillGrid<T>(items: T[], count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => items[i % items.length]);
}

function SegmentedTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center justify-center rounded-md px-3 text-sm transition-colors',
        active ? 'bg-chrome-bg text-chrome-fg shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_rgba(0,0,0,0.02)]' : 'text-white/70 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

function ImageTile({ url, label, onSelect }: { url: string; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      className="size-[134px] shrink-0 overflow-hidden rounded-lg border border-white/20 bg-cover bg-center transition-[border-color] hover:border-white/50"
      style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    />
  );
}

export function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}) {
  const uploadedAssetUrls = useAppStore((s) => s.uploadedAssetUrls);
  const addUploadedAsset = useAppStore((s) => s.addUploadedAsset);
  const language = useAppStore((s) => s.language);
  const t = useT();
  const [tab, setTab] = useState<TabId>('visuals');
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSearching = query.trim().length > 0;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SAMPLE_IMAGES;
    return SAMPLE_IMAGES.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);
  // A real search should show only real matches — repeating a handful of results to pad out
  // 3 rows would misleadingly look like there are more matches than there actually are.
  const visualsGrid = isSearching ? filtered : fillGrid(SAMPLE_IMAGES, GRID_SIZE);
  const uploadFillCount = Math.max(0, GRID_SIZE - 1 - uploadedAssetUrls.length);
  const uploadGrid = fillGrid(SAMPLE_IMAGES, uploadFillCount);

  function choose(url: string) {
    onSelect(url);
    onOpenChange(false);
  }

  function handleUpload(file: File) {
    const url = URL.createObjectURL(file);
    addUploadedAsset(url);
    choose(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[800px] max-w-[calc(100%-2rem)] flex-col gap-0 rounded-[24px] border-chrome-border-soft bg-[#26262C]/88 p-0 text-chrome-fg backdrop-blur-lg sm:max-w-[800px]"
      >
        <DialogTitle className="sr-only">{t('Choose a visual')}</DialogTitle>

        <div className="flex flex-col gap-4 border-b border-chrome-border px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-full border border-chrome-border bg-chrome-border-subtle px-3">
              <Search className="size-4 text-white/70" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search')}
                className="w-full bg-transparent text-sm text-chrome-fg placeholder:text-white/25 outline-none"
              />
            </div>
            <button type="button" aria-label={t('Close')} onClick={() => onOpenChange(false)} className="text-white/45 transition-colors hover:text-white/80">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 rounded-lg bg-black/20 p-[3px]">
              <SegmentedTab active={tab === 'visuals'} onClick={() => setTab('visuals')}>
                {t('Beachside visuals')}
              </SegmentedTab>
              <SegmentedTab active={tab === 'upload'} onClick={() => setTab('upload')}>
                {t('Upload')}
              </SegmentedTab>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-8 py-6">
          {tab === 'visuals' ? (
            <>
              <button
                type="button"
                className="flex h-8 w-fit shrink-0 items-center gap-1 self-start rounded-full border border-chrome-border-soft bg-[#26262C]/88 px-4 text-sm text-white/85"
              >
                {t('All visuals')}
                <ChevronDown className="size-3" />
              </button>
              <div className="flex flex-wrap gap-4">
                {visualsGrid.map((item, i) => (
                  <ImageTile key={`${item.file}-${i}`} url={item.url} label={item.label} onSelect={() => choose(item.url)} />
                ))}
                {isSearching && filtered.length === 0 && (
                  <div className="w-full py-8 text-center text-sm text-white/45">
                    {language === 'ja' ? `"${query}" に一致するビジュアルはありません` : `No visuals match "${query}"`}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex size-[134px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white bg-chrome-border-soft text-chrome-fg transition-colors hover:bg-white/10"
              >
                <Upload className="size-6" />
                <span className="text-sm">{t('Upload')}</span>
              </button>
              {uploadedAssetUrls.map((url) => (
                <ImageTile key={url} url={url} label={t('Uploaded image')} onSelect={() => choose(url)} />
              ))}
              {uploadGrid.map((item, i) => (
                <ImageTile key={`${item.file}-${i}`} url={item.url} label={item.label} onSelect={() => choose(item.url)} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
