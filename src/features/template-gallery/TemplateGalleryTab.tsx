import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { platforms, savedTemplates } from '@/lib/mock';
import { useT } from '@/lib/i18n';
import type { SavedTemplate, SizeClass } from '@/types';
import { TemplateCard } from './TemplateCard';

const SIZE_CLASSES: SizeClass[] = ['wide', 'landscape', 'square', 'portrait', 'tall'];
const CATEGORIES: { value: SavedTemplate['category']; label: string }[] = [
  { value: 'productHero', label: 'Product hero' },
  { value: 'salePromo', label: 'Sale / promo' },
  { value: 'multiProduct', label: 'Multi-product' },
  { value: 'textLed', label: 'Text-led' },
];

export function TemplateGalleryTab({ onSelect }: { onSelect: (template: SavedTemplate) => void }) {
  const t = useT();
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sizeClassFilter, setSizeClassFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const filtered = useMemo(
    () =>
      savedTemplates.filter((t) => {
        if (platformFilter !== 'all' && t.platformId !== platformFilter) return false;
        if (sizeClassFilter !== 'all' && t.layout.sizeClass !== sizeClassFilter) return false;
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        return true;
      }),
    [platformFilter, sizeClassFilter, categoryFilter],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder={t('Platform')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('All platforms')}</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sizeClassFilter} onValueChange={setSizeClassFilter}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder={t('Size class')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('All sizes')}</SelectItem>
            {SIZE_CLASSES.map((sc) => (
              <SelectItem key={sc} value={sc} className="capitalize">
                {t(sc)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder={t('Category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('All categories')}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {t(c.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid max-h-[420px] grid-cols-3 gap-3 overflow-y-auto pr-1">
        {filtered.map((template) => (
          <TemplateCard key={template.id} template={template} onSelect={onSelect} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3 py-10 text-center text-sm text-muted-foreground">{t('No templates match these filters.')}</div>
        )}
      </div>
    </div>
  );
}
