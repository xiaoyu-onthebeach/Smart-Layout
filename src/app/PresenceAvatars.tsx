import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useAppStore } from '@/store/useAppStore';
import { PRESENCE_USERS as USERS } from '@/lib/presence';

/** Everyone else on the playground — the current user already has their own avatar on the right. */
const OTHERS = USERS.filter((user) => !user.you);

/**
 * The other people on the playground right now, left of Share (Figma "Avatar stack"): 32px avatars
 * overlapping by 8px, the first on top. Hovering one shows their name; clicking follows them on the
 * canvas (again to stop — see RemoteCursors), their avatar ringed in their color meanwhile. The mode
 * stays as it is.
 */
export function PresenceAvatars() {
  const t = useT();
  const followingUserName = useAppStore((s) => s.followingUserName);
  const setFollowingUser = useAppStore((s) => s.setFollowingUser);
  return (
    <div className="mr-2 flex items-center">
      {OTHERS.map((user, i) => {
        const followed = followingUserName === user.name;
        const avatar = <img src={user.avatar} alt="" className="size-8 shrink-0 rounded-full object-cover" />;
        return (
          <Tooltip key={user.name}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={followed ? `${t('Stop following')} ${user.name}` : `${t('Follow')} ${user.name}`}
                aria-pressed={followed}
                onClick={() => setFollowingUser(followed ? null : user.name)}
                className={cn('relative shrink-0 cursor-pointer rounded-full', i > 0 && '-ml-2')}
                style={{ zIndex: OTHERS.length - i }}
              >
                {avatar}
                {/* Following them: a ring in their color, over the photo (which keeps its size),
                    easing in from slightly larger rather than popping on. */}
                <span
                  className={cn(
                    'pointer-events-none absolute inset-0 rounded-full border-2 transition-[opacity,scale] duration-300 ease-out',
                    followed ? 'scale-100 opacity-100' : 'scale-125 opacity-0',
                  )}
                  style={{ borderColor: user.color }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="text-[14px]">
              {user.name}
              <span className="ml-1 text-white/45">· {followed ? t('Stop following') : t('Follow')}</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
