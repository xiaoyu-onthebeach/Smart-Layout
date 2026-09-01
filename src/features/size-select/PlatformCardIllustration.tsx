/**
 * A decorative "banner mockup" illustration used as a size card's preview image — an icon badge,
 * an accent-colored block, and a few gray placeholder blocks/lines standing in for real content.
 * The geometry mirrors the reference SVGs in /public/icons (amazon/rakuten banner 1/2/3.svg):
 * three fixed compositions ("hero", "leaderboard", "portrait") reused across every preset,
 * picked by aspect ratio, with only the platform's own icon + accent color swapped in.
 */

export type CardShape = 'hero' | 'leaderboard' | 'portrait';

/** Which of the 3 stock compositions best suits a given preset's aspect ratio. */
export function shapeForRatio(width: number, height: number): CardShape {
  const ratio = width / height;
  if (ratio >= 3) return 'leaderboard';
  if (ratio >= 1.2) return 'hero';
  return 'portrait';
}

type PlatformAccent = { icon: string; gradientEnd: string };

// Amazon/Rakuten values are taken directly from the reference SVGs; Yahoo's purple is likewise
// pulled from the provided design spec. Qoo10/TikTok don't have a reference illustration, so
// their accents are our own best-effort picks from each brand's real mark (TikTok's cyan/pink,
// Qoo10's magenta) rather than sourced from a supplied example.
const PLATFORM_ACCENTS: Record<string, PlatformAccent> = {
  amazon: { icon: '/icons/ec-platform-icon/amazon.svg', gradientEnd: '#995500' },
  rakuten: { icon: '/icons/ec-platform-icon/rakuten.svg', gradientEnd: '#841323' },
  yahoo: { icon: '/icons/ec-platform-icon/yahoo.svg', gradientEnd: '#3D0080' },
  qoo10: { icon: '/icons/ec-platform-icon/qoo10.svg', gradientEnd: '#7A1338' },
  tiktok: { icon: '/icons/ec-platform-icon/tiktok.svg', gradientEnd: '#7A1656' },
};

const FALLBACK_ACCENT: PlatformAccent = { icon: '/icons/ec-platform-icon/amazon.svg', gradientEnd: '#1F3480' };

function Block({ left, top, width, height, radius = 6 }: { left: number; top: number; width: number; height: number; radius?: number }) {
  return <div className="absolute" style={{ left, top, width, height, borderRadius: radius, background: '#40404A' }} />;
}

function Circle({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <div className="absolute rounded-full" style={{ left: cx - r, top: cy - r, width: r * 2, height: r * 2, background: '#40404A' }} />;
}

export function PlatformCardIllustration({ platformId, width, height }: { platformId: string; width: number; height: number }) {
  const accent = PLATFORM_ACCENTS[platformId] ?? FALLBACK_ACCENT;
  const shape = shapeForRatio(width, height);

  const icon = <img src={accent.icon} alt="" className="absolute size-[27px] rounded-lg" style={{ left: 15, top: 15 }} />;

  return (
    <div className="relative h-[207px] w-full overflow-hidden" style={{ background: '#131316' }}>
      {shape === 'hero' && (
        <div className="absolute overflow-hidden rounded-[22px]" style={{ left: 31, top: 32, width: 288, height: 222, background: '#212128' }}>
          {icon}
          <Circle cx={32} cy={73} r={14} />
          <Circle cx={74} cy={73} r={14} />
          <Circle cx={116} cy={73} r={14} />
          <Block left={142} top={60} width={98} height={8} radius={4} />
          <Block left={142} top={78} width={125} height={8} radius={4} />
          <div
            className="absolute rounded-md"
            style={{ left: 18, top: 98, width: 249, height: 44, background: `linear-gradient(to right, #F5F5F5, ${accent.gradientEnd})` }}
          />
          <Block left={18} top={154} width={79} height={54} />
          <Block left={105} top={154} width={78} height={54} />
          <Block left={191} top={154} width={78} height={54} />
        </div>
      )}

      {shape === 'leaderboard' && (
        <div className="absolute overflow-hidden rounded-[22px]" style={{ left: 31, top: 32, width: 288, height: 206, background: '#212128' }}>
          {icon}
          <div
            className="absolute rounded-md"
            style={{ left: 18, top: 54, width: 249, height: 19, background: `linear-gradient(to right, #F5F5F5, ${accent.gradientEnd})` }}
          />
          <Circle cx={32} cy={105} r={14} />
          <Circle cx={74} cy={105} r={14} />
          <Circle cx={116} cy={105} r={14} />
          <Block left={142} top={92} width={98} height={8} radius={4} />
          <Block left={142} top={110} width={125} height={8} radius={4} />
          <Block left={18} top={137} width={79} height={54} />
          <Block left={105} top={137} width={78} height={54} />
          <Block left={191} top={137} width={78} height={54} />
        </div>
      )}

      {shape === 'portrait' && (
        <div className="absolute overflow-hidden rounded-[22px]" style={{ left: 31, top: 30, width: 287, height: 228, background: '#212128' }}>
          {icon}
          <div
            className="absolute rounded-lg"
            style={{ left: 189, top: 54, width: 78, height: 144, background: `linear-gradient(to bottom, #F5F5F5, ${accent.gradientEnd})` }}
          />
          <Block left={15} top={54} width={78} height={61} radius={8} />
          <Block left={102} top={54} width={78} height={61} radius={8} />
          <Block left={15} top={121} width={41} height={9} radius={5} />
          <Block left={102} top={121} width={41} height={9} radius={5} />
          <Block left={15} top={138} width={78} height={61} radius={8} />
          <Block left={102} top={138} width={78} height={61} radius={8} />
        </div>
      )}
    </div>
  );
}
