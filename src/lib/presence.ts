/** Mocked for now: who has the playground open — shown as avatars in the top bar and, for everyone
 * but the current user, as cursors moving on the canvas. The current user comes first. Each other
 * person's color is their avatar's, from the design tokens (see index.css). */
export type PresenceUser = { name: string; avatar: string; color?: string; you?: boolean };

export const PRESENCE_USERS: PresenceUser[] = [
  // Same picture as the account menu's, at the right end of the top bar.
  { name: 'Baptiste Ndiaye', avatar: '/samples/Baptiste.jpg', you: true },
  { name: 'Yui Nakamura', avatar: '/avatars/yui.jpg', color: 'var(--sunburn)' },
  { name: 'Aiko Sato', avatar: '/avatars/avatar-pink.svg', color: 'var(--popsicle)' },
];

/** The border around the canvas while following someone, in their color (see RemoteCursors, and
 * ModeSwitch which carries it around the mode tab): its width in px. */
export const FOLLOW_BORDER = { width: 2 };
