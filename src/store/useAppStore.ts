import { create } from 'zustand';
import type { AppState } from './types';
import { createUiSlice } from './uiSlice';
import { createSetSlice } from './setSlice';
import { createLayoutsSlice } from './layoutsSlice';
import { createProductsSlice } from './productsSlice';

export const useAppStore = create<AppState>()((...a) => ({
  ...createUiSlice(...a),
  ...createSetSlice(...a),
  ...createLayoutsSlice(...a),
  ...createProductsSlice(...a),
}));
