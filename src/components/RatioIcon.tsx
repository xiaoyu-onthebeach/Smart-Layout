const ICON_BOX = 24;
const MAX_INSET_SIDE = 18; // 75% of 24, matching the given "ratio /" icon spec

/** Small 24x24 aspect-ratio glyph — a white-outlined rect proportioned to width:height. */
export function RatioIcon({ width, height, className }: { width: number; height: number; className?: string }) {
  const ratio = width / height;
  let w = MAX_INSET_SIDE;
  let h = w / ratio;
  if (h > MAX_INSET_SIDE) {
    h = MAX_INSET_SIDE;
    w = h * ratio;
  }

  return (
    <div className={className} style={{ width: ICON_BOX, height: ICON_BOX, position: 'relative', flexShrink: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: Math.max(w, 2),
          height: Math.max(h, 2),
          transform: 'translate(-50%, -50%)',
          border: '1.5px solid #ffffff',
        }}
      />
    </div>
  );
}
