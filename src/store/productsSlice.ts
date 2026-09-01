import { products } from '@/lib/mock';
import type { Slice, ProductsSlice } from './types';

export const createProductsSlice: Slice<ProductsSlice> = (set, get) => ({
  activeProductIds: [],
  setActiveProducts: (ids) => set({ activeProductIds: ids }),
  getActiveProducts: () => {
    const ids = get().activeProductIds;
    return products.filter((p) => ids.includes(p.id));
  },
});
