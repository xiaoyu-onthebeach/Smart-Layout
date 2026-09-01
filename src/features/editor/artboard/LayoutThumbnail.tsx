import { cn } from '@/lib/utils';
import type { LayoutElement } from '@/types';
import { ElementRenderer } from './ElementRenderer';

/** Non-interactive, live-rendered preview of a set of elements at a given size. */
export function LayoutThumbnail({
  width,
  height,
  elements,
  className,
}: {
  width: number;
  height: number;
  elements: LayoutElement[];
  className?: string;
}) {
  return (
    <div
      className={cn('relative w-full overflow-hidden bg-white', className)}
      style={{ aspectRatio: `${width} / ${height}`, containerType: 'inline-size' }}
    >
      {elements
        .filter((el) => el.visible)
        .map((el) => (
          <ElementRenderer key={el.id} element={el} layoutWidth={width} layoutHeight={height} />
        ))}
    </div>
  );
}
