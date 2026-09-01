import { Badge } from '@/components/ui/badge';
import { getPlatform } from '@/lib/mock';
import { useT } from '@/lib/i18n';
import type { SavedTemplate } from '@/types';
import { LayoutThumbnail } from '@/features/editor/artboard/LayoutThumbnail';

const CATEGORY_LABEL: Record<SavedTemplate['category'], string> = {
  productHero: 'Product hero',
  salePromo: 'Sale / promo',
  multiProduct: 'Multi-product',
  textLed: 'Text-led',
};

export function TemplateCard({ template, onSelect }: { template: SavedTemplate; onSelect: (template: SavedTemplate) => void }) {
  const platform = template.platformId ? getPlatform(template.platformId) : undefined;
  const { width, height } = template.layout.size;
  const t = useT();

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/40 hover:bg-accent"
    >
      <LayoutThumbnail width={width} height={height} elements={template.layout.elements} className="border-b border-border" />
      <div className="flex flex-col gap-1.5 p-3">
        <div className="text-sm font-medium">{template.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            {width} × {height}
          </span>
          {platform && (
            <>
              <span>·</span>
              <span>{platform.name}</span>
            </>
          )}
        </div>
        <Badge variant="outline" className="w-fit text-xs">
          {t(CATEGORY_LABEL[template.category])}
        </Badge>
      </div>
    </button>
  );
}
