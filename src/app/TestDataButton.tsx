import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/store/useAppStore';
import { hasSavedTestPlayground, loadTestPlayground, saveTestPlayground, saveTestPlaygroundToProject } from '@/lib/test-playground';

/**
 * Testing shortcut, deliberately hidden: an invisible spot in the bottom-left corner of the screen
 * (a flask shows on hover) with "Load test banners" — brings back the banners saved earlier, in
 * one click from anywhere, including the Playgrounds page — "Save current banners as test
 * banners" (this browser only) and "Save current banners to the project" (a file committed with the
 * code, so every browser and teammate can load the same set). Not translated: it's for the team.
 */
export function TestDataButton() {
  const hasBanners = useAppStore((s) => s.pageOrder.length > 0);
  const [hasSaved, setHasSaved] = useState(false);
  return (
    <DropdownMenu onOpenChange={(open) => open && hasSavedTestPlayground().then(setHasSaved, () => setHasSaved(false))}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Test data"
          className="fixed bottom-0 left-0 z-50 flex size-8 items-center justify-center text-white/40 opacity-0 outline-none transition-opacity hover:opacity-100 data-[state=open]:opacity-100"
        >
          <FlaskConical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuItem
          disabled={!hasSaved}
          onSelect={() =>
            loadTestPlayground().then(
              (loaded) => !loaded && toast('No test banners saved yet'),
              () => toast.error('Could not load the test banners'),
            )
          }
        >
          Load test banners
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasBanners}
          onSelect={() =>
            saveTestPlayground().then(
              () => toast.success('Current banners saved as test banners'),
              () => toast.error('Could not save the test banners'),
            )
          }
        >
          Save current banners as test banners
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!hasBanners}
          onSelect={() =>
            saveTestPlaygroundToProject().then(
              () => toast.success('Saved to public/test-playground.json — commit it to share'),
              () => toast.error('Could not save to the project (only works with the dev server)'),
            )
          }
        >
          Save current banners to the project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
