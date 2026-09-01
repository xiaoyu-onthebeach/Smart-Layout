/** The prototype's stock product photos — shared by the image picker dialog and the Assets panel. */
export const SAMPLE_IMAGES = [
  { file: 'black_1.png', label: 'Benthia Totale — night serum' },
  { file: 'red_1.png', label: 'Nereida — liquid lip tint' },
  { file: 'beige_3.png', label: 'Nereida — matte essentials set' },
  { file: 'blue_1.png', label: 'La Plage — hydration trio' },
  { file: 'Orange_1.png', label: 'Desiaqua — aqua-oasis EDP' },
  { file: 'black_3.png', label: "Orla D'Mar — citrus liquid soap" },
  { file: 'red_3.png', label: 'AERA — Re-Vitalize duo' },
  { file: 'beige_1.png', label: 'Irideaux — eau de parfum' },
  { file: 'beige_2.png', label: 'Mer Beauté — colour collection' },
].map((item) => ({ ...item, url: `/samples/${item.file}` }));
