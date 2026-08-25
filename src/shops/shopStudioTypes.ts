import type { ClassId } from '../classes/classCatalog';
import type { ItemStudioCategory } from '../items/itemStudioStore';

export type ShopStudioStatus = 'draft' | 'published' | 'disabled';
export type ShopStudioSource = 'legacy' | 'custom';
export type ShopCurrencyType = 'coins' | 'item';
export type ShopStockMode = 'infinite' | 'limited';
export type ShopRestockMode = 'never' | 'minutes' | 'daily' | 'weekly' | 'event';

export type ShopStockConfig = {
  mode: ShopStockMode;
  quantity: number;
  restock: ShopRestockMode;
  intervalMinutes?: number;
};

export type ShopStudioItem = {
  itemId: string;
  numericId?: number;
  buyPrice: number;
  sellPrice?: number;
  useItemValueForSell?: boolean;
  stock: ShopStockConfig;
  perPlayerLimit?: number;
  sortOrder: number;
};

export type ShopPriceRule = {
  id: string;
  category?: ItemStudioCategory;
  tag?: string;
  buyMultiplier: number;
  sellMultiplier: number;
};

export type ShopRequirements = {
  minLevel?: number;
  maxLevel?: number;
  classIds?: ClassId[];
  completedQuests?: string[];
  activeQuest?: string;
  eventKey?: string;
  requiredItems?: Array<{ itemId: string; quantity: number }>;
};

export type ShopStudioRecord = {
  version: 1;
  numericId: number;
  key: string;
  source: ShopStudioSource;
  status: ShopStudioStatus;
  name: string;
  role: string;
  description: string;
  icon: string;
  greeting: string;
  specialty: string;
  tags: string[];
  priority: number;
  currency: { type: ShopCurrencyType; itemId?: string; numericId?: number };
  allowBuy: boolean;
  allowSell: boolean;
  defaultBuyMultiplier: number;
  defaultSellMultiplier: number;
  acceptedCategories: ItemStudioCategory[];
  items: ShopStudioItem[];
  priceRules: ShopPriceRule[];
  requirements: ShopRequirements;
  createdAt: number;
  updatedAt: number;
};

export type ShopValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
};
