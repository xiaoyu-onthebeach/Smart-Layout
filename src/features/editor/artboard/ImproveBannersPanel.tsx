import { ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useT } from '@/lib/i18n';

/** "Improve banner", for each of `pageIds` — mocked for now: the banner just goes through its
 * loading state, as when a size is generated. */
export function improveBanners(pageIds: string[]) {
  const state = useAppStore.getState();
  for (const id of pageIds) {
    state.startPageLoading(id);
    state.clearBulkEditEdited(id);
  }
}

/**
 * Floats under a banner on Replace's preview once banners have been edited from the table, scoped to
 * what was changed (see MultiPageCanvas): under the one edited banner of a set, or under a set's
 * primary for all of that set's edited banners. Rests as a small pill (icon and arrow) so it fits
 * between banners at the preview's zoom; hovering it opens the full panel — same look as Create's
 * "Apply changes to all sizes" (CascadeToolbar).
 */
export function ImproveBannersPanel({ pageIds }: { pageIds: string[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const count = pageIds.length;
  const title = count === 1 ? t('Improve banner') : language === 'ja' ? `${count}件のバナーを改善` : `Improve ${count} edited banners`;
  return (
    <div
      className="group/improve flex animate-in items-center gap-2 rounded-xl border py-1 pr-1 pl-2 fade-in-0 slide-in-from-top-1 hover:gap-3 hover:rounded-2xl hover:py-2 hover:pr-2 hover:pl-3 focus-within:gap-3 focus-within:rounded-2xl focus-within:py-2 focus-within:pr-2 focus-within:pl-3"
      style={{ background: 'rgba(38,38,44,0.88)', borderColor: '#2F2F37', boxShadow: '0px 4px 32px 4px rgba(0,0,0,0.24)', backdropFilter: 'blur(16px)' }}
    >
      <ImproveBannerIcon className="size-5 shrink-0 text-white group-hover/improve:size-6 group-focus-within/improve:size-6" />
      <span className="hidden min-w-0 flex-col gap-0.5 group-hover/improve:flex group-focus-within/improve:flex">
        <span className="text-sm leading-5 font-semibold whitespace-nowrap text-white">{title}</span>
        <span className="text-[11px] leading-[1.4] whitespace-nowrap text-white/45">{t('Adjust size and spacing to match the new content.')}</span>
      </span>
      <button
        type="button"
        aria-label={title}
        title={title}
        onClick={() => improveBanners(pageIds)}
        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-button-primary text-white shadow-[0px_1px_2px_rgba(0,0,0,0.03),0px_1px_6px_-1px_rgba(0,0,0,0.02),0px_2px_4px_rgba(0,0,0,0.02)] transition-colors group-hover/improve:size-8 group-focus-within/improve:size-8 hover:brightness-110"
      >
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

/** "Improve banner" — a frame with a sparkle inside, inline in `currentColor`. */
export function ImproveBannerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path
        d="M19.5 1.25C21.2942 1.25 22.75 2.70579 22.75 4.5C22.75 5.85197 21.9237 7.00952 20.75 7.49902V16.5C21.9239 16.9894 22.75 18.1479 22.75 19.5C22.75 21.2942 21.2942 22.75 19.5 22.75C18.148 22.75 16.9905 21.9237 16.501 20.75H7.49902C7.00952 21.9237 5.85197 22.75 4.5 22.75C2.70579 22.75 1.25 21.2942 1.25 19.5C1.25 18.1479 2.07608 16.9894 3.25 16.5V7.49902C2.07627 7.00952 1.25 5.85197 1.25 4.5C1.25 2.70579 2.70579 1.25 4.5 1.25C5.85187 1.25 7.00859 2.07638 7.49805 3.25H16.501C16.9905 2.07627 18.148 1.25 19.5 1.25ZM4.5 17.75C4.4204 17.75 4.33621 17.7583 4.24902 17.7705C4.2128 17.7756 4.17571 17.7792 4.13867 17.7861C3.34714 17.9504 2.75 18.6567 2.75 19.5C2.75 20.4658 3.53421 21.25 4.5 21.25C5.34491 21.25 6.05032 20.6502 6.21289 19.8564C6.23599 19.7319 6.25 19.6113 6.25 19.5C6.25 18.5342 5.46579 17.75 4.5 17.75ZM19.5 17.75C18.5342 17.75 17.75 18.5342 17.75 19.5C17.75 19.5905 17.7597 19.6871 17.7754 19.7871C17.7788 19.8087 17.7811 19.8307 17.7852 19.8525C17.7854 19.8539 17.7859 19.8551 17.7861 19.8564C17.9486 20.6503 18.655 21.25 19.5 21.25C20.4658 21.25 21.25 20.4658 21.25 19.5C21.25 18.6557 20.6513 17.9494 19.8584 17.7861C19.8346 17.7817 19.8106 17.7791 19.7871 17.7754C19.6871 17.7597 19.5905 17.75 19.5 17.75ZM7.73926 4.75C7.69415 5.34211 7.48919 5.88851 7.16895 6.34961C7.15062 6.376 7.13041 6.40094 7.11133 6.42676C6.91824 6.68795 6.68795 6.91824 6.42676 7.11133C6.40094 7.13041 6.376 7.15062 6.34961 7.16895C6.27882 7.21811 6.20656 7.26507 6.13184 7.30859C6.12691 7.31146 6.12212 7.31454 6.11719 7.31738C5.70874 7.55244 5.24522 7.70153 4.75 7.73926V16.2598C4.75359 16.26 4.75716 16.2605 4.76074 16.2607C4.85438 16.2682 4.94685 16.2797 5.03809 16.2949C5.04426 16.296 5.05047 16.2968 5.05664 16.2979C5.14612 16.3133 5.23447 16.3319 5.32129 16.3545C5.33215 16.3573 5.3427 16.3613 5.35352 16.3643C5.52799 16.4117 5.69688 16.4724 5.8584 16.5469C5.86527 16.55 5.87206 16.5534 5.87891 16.5566C5.95385 16.5918 6.02694 16.6303 6.09863 16.6709C6.11462 16.68 6.13066 16.6889 6.14648 16.6982C6.21275 16.7373 6.27669 16.7797 6.33984 16.8232C6.3786 16.85 6.41561 16.8789 6.45312 16.9072C6.57414 16.9986 6.69084 17.0951 6.79785 17.2021C6.86609 17.2704 6.93119 17.3419 6.99316 17.416C7.0179 17.4456 7.03979 17.4774 7.06348 17.5078C7.09917 17.5537 7.13473 17.5997 7.16797 17.6475C7.21744 17.7186 7.26481 17.7911 7.30859 17.8662C7.30969 17.8681 7.31043 17.8702 7.31152 17.8721C7.55012 18.2831 7.7012 18.7505 7.73926 19.25H16.2607C16.2988 18.7505 16.4499 18.2831 16.6885 17.8721C16.6895 17.8703 16.6894 17.868 16.6904 17.8662C16.7343 17.791 16.7825 17.7187 16.832 17.6475C16.8653 17.5997 16.9008 17.5537 16.9365 17.5078C16.9601 17.4775 16.9813 17.4454 17.0059 17.416C17.068 17.3417 17.1338 17.2706 17.2021 17.2021C17.309 17.0953 17.4251 16.9984 17.5459 16.9072C17.5834 16.8789 17.6204 16.85 17.6592 16.8232C17.7223 16.7797 17.7863 16.7373 17.8525 16.6982C17.8684 16.6889 17.8844 16.68 17.9004 16.6709C17.9721 16.6303 18.0452 16.5918 18.1201 16.5566C18.127 16.5534 18.1338 16.55 18.1406 16.5469C18.3021 16.4724 18.4711 16.4117 18.6455 16.3643C18.6563 16.3613 18.6669 16.3573 18.6777 16.3545C18.7645 16.3318 18.8529 16.3133 18.9424 16.2979C18.9485 16.2968 18.9548 16.296 18.9609 16.2949C19.0293 16.2835 19.0983 16.2737 19.168 16.2666L19.25 16.2598V7.73926C18.7545 7.7015 18.2905 7.55268 17.8818 7.31738C17.8769 7.31454 17.8721 7.31146 17.8672 7.30859C17.7925 7.26505 17.7202 7.21812 17.6494 7.16895C17.623 7.15062 17.5981 7.13041 17.5723 7.11133C17.3112 6.91822 17.0807 6.68793 16.8877 6.42676C16.8686 6.40094 16.8484 6.376 16.8301 6.34961C16.51 5.88861 16.3058 5.34192 16.2607 4.75H7.73926ZM11.3711 7.41504C11.6087 6.86247 12.3936 6.86206 12.6309 7.41504L13.5469 9.55469C13.7201 9.95834 14.0425 10.28 14.4463 10.4531L16.5859 11.3711C17.138 11.6087 17.138 12.3923 16.5859 12.6299L14.4463 13.5469C14.0424 13.7201 13.72 14.0424 13.5469 14.4463L12.6309 16.585C12.3937 17.1384 11.6085 17.1381 11.3711 16.585L10.4531 14.4463C10.2801 14.0427 9.95902 13.7202 9.55566 13.5469L7.41504 12.6299C6.86183 12.3926 6.86203 11.6085 7.41504 11.3711L9.55566 10.4531C9.95875 10.2798 10.2801 9.9579 10.4531 9.55469L11.3711 7.41504ZM4.5 2.75C3.53421 2.75 2.75 3.53421 2.75 4.5C2.75 5.34458 3.34928 6.04995 4.14258 6.21289C4.26748 6.2361 4.3884 6.25 4.5 6.25C5.46579 6.25 6.25 5.46579 6.25 4.5C6.25 4.38727 6.23654 4.26491 6.21289 4.13867H6.21191C6.04745 3.34733 5.34318 2.75 4.5 2.75ZM19.5 2.75C18.6568 2.75 17.9515 3.34723 17.7871 4.13867L17.7598 4.32422C17.7534 4.38475 17.75 4.44358 17.75 4.5C17.75 5.46579 18.5342 6.25 19.5 6.25C19.6113 6.25 19.7319 6.23599 19.8564 6.21289C20.6502 6.05032 21.25 5.34491 21.25 4.5C21.25 3.53421 20.4658 2.75 19.5 2.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
