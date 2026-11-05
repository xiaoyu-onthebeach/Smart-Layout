import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { PRESENCE_USERS as USERS } from '@/lib/presence';

/**
 * The people on the playground right now, left of Share (Figma "Avatar stack"): 32px avatars
 * overlapping by 8px, the first on top. The current user — the file's owner — is first and the
 * only one ringed, in blue; hovering any of them shows their name.
 */
export function PresenceAvatars() {
  const t = useT();
  return (
    <div className="mr-2 flex items-center">
      {USERS.map((user, i) => (
        <Tooltip key={user.name}>
          <TooltipTrigger asChild>
            <img
              src={user.avatar}
              alt={user.name}
              className={cn('relative size-8 shrink-0 rounded-full object-cover', i > 0 && '-ml-2', user.you && 'border-2 border-chrome-active')}
              style={{ zIndex: USERS.length - i }}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8} className="text-[14px]">
            {user.name}
            {user.you && <span className="ml-1 text-white/45">({t('You')})</span>}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
