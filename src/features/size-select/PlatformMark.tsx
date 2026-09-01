import { cn } from '@/lib/utils';

/** A platform's real logo mark, used anywhere a size/scene needs to show which EC platform it belongs to. */
export function PlatformMark({ platformId, className }: { platformId: string; className?: string }) {
  return <img src={`/icons/ec-platform-icon/${platformId}.svg`} alt="" className={cn('rounded-[6px]', className)} />;
}
