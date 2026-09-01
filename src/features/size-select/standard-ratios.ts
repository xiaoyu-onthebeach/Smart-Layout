export type StandardRatio = {
  id: string;
  ratioLabel: string;
  name: string;
  width: number;
  height: number;
};

export const STANDARD_RATIOS: StandardRatio[] = [
  { id: 'square', ratioLabel: '1:1', name: 'Square', width: 1080, height: 1080 },
  { id: 'landscape', ratioLabel: '4:3', name: 'Landscape', width: 1200, height: 900 },
  { id: 'portrait', ratioLabel: '3:4', name: 'Portrait', width: 900, height: 1200 },
  { id: 'widescreen', ratioLabel: '16:9', name: 'Widescreen', width: 1920, height: 1080 },
  { id: 'story', ratioLabel: '9:16', name: 'Story', width: 1080, height: 1920 },
  { id: 'paper', ratioLabel: 'A4', name: 'Paper', width: 1240, height: 1754 },
];
