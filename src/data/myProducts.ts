/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Single-source product & pricing catalog for The Gene Protocol.
// Transcribed from TGP-Pricelist 3-9-26.PNG. A few entries were ambiguous in the
// source image (marked with a `note`) - double check these against the original
// list before going live.

export interface ProductPriceOption {
  code?: string;
  vialSize: string;
  priceUsd: number;
  inStock?: boolean;
}

export interface Product {
  id: string;
  name: string;
  options: ProductPriceOption[];
  note?: string;
}

export const MY_PRODUCTS: Product[] = [
  {
    id: "5-amino-1mq",
    name: "5-Amino-1MQ",
    options: [
      { code: "5AM", vialSize: "5mg", priceUsd: 65, inStock: true },
      { code: "50AM", vialSize: "50mg", priceUsd: 140 },
    ],
  },
  {
    id: "ara-290",
    name: "Ara-290",
    options: [{ code: "RA10", vialSize: "10mg", priceUsd: 90, inStock: true }],
  },
  {
    id: "bac-water",
    name: "Bac Water",
    options: [
      { code: "BA3", vialSize: "3ml", priceUsd: 10, inStock: true },
      { code: "BA10", vialSize: "10ml", priceUsd: 20, inStock: true },
    ],
  },
  {
    id: "bpc157",
    name: "BPC157",
    options: [
      { code: "BC5", vialSize: "5mg", priceUsd: 80 },
      { code: "BC10", vialSize: "10mg", priceUsd: 90 },
    ],
  },
  {
    id: "cerebrolysin",
    name: "Cerebrolysin",
    options: [{ code: "CBL60", vialSize: "60mg", priceUsd: 80 }],
  },
  {
    id: "cjc1295-ipamorelin",
    name: "CJC1295 + Ipamorelin Blend (no DAC)",
    options: [{ code: "CP10", vialSize: "10mg", priceUsd: 80, inStock: true }],
  },
  {
    id: "epithalon",
    name: "Epithalon",
    options: [{ code: "ET10", vialSize: "10mg", priceUsd: 60 }],
  },
  {
    id: "ghk-cu",
    name: "GHK-Cu",
    options: [
      { code: "CU50", vialSize: "50mg", priceUsd: 60, inStock: true },
      { code: "CU100", vialSize: "100mg", priceUsd: 100 },
    ],
  },
  {
    id: "glow",
    name: "GLOW",
    options: [{ code: "BBG70", vialSize: "70mg", priceUsd: 180, inStock: true }],
  },
  {
    id: "glutathione",
    name: "Glutathione",
    options: [
      { code: "GT600", vialSize: "600mg", priceUsd: 65 },
      { code: "GT1500", vialSize: "1500mg", priceUsd: 80 },
    ],
  },
  {
    id: "hcg",
    name: "HCG 10,000 IU",
    options: [{ code: "G10K", vialSize: "10,000 IU", priceUsd: 120 }],
  },
  {
    id: "igf1-lr3",
    name: "IGF1-LR3",
    options: [{ code: "IG01", vialSize: "100mcg", priceUsd: 65 }],
  },
  {
    id: "klow",
    name: "KLOW (GHKCU/BPC157/TB500/KPV)",
    options: [{ code: "BBK80", vialSize: "80mg", priceUsd: 160, inStock: true }],
  },
  {
    id: "kpv",
    name: "KPV",
    options: [
      { code: "KPV5", vialSize: "5mg", priceUsd: 50 },
      { code: "KPV10", vialSize: "10mg", priceUsd: 65 },
    ],
  },
  {
    id: "lipo-c",
    name: "Lipo-C (Fat Blaster)",
    options: [{ code: "LC526", vialSize: "10ml", priceUsd: 180 }],
  },
  {
    id: "melanotan2",
    name: "Melanotan 2",
    options: [{ code: "ML10", vialSize: "10mg", priceUsd: 60, inStock: true }],
  },
  {
    id: "mots-c",
    name: "Mots-C",
    options: [{ code: "MS10", vialSize: "10mg", priceUsd: 65, inStock: true }],
  },
  {
    id: "nad",
    name: "NAD+",
    options: [
      { code: "NJ500", vialSize: "500mg", priceUsd: 80 },
      { code: "NJ1000", vialSize: "1000mg", priceUsd: 130, inStock: true },
    ],
  },
  {
    id: "oxytocin-acetate",
    name: "Oxytocin Acetate",
    options: [{ code: "OT10", vialSize: "10mg", priceUsd: 75 }],
  },
  {
    id: "pt-141",
    name: "PT-141",
    options: [{ code: "P41", vialSize: "10mg", priceUsd: 70 }],
  },
  {
    id: "retatrutide",
    name: "Retatrutide",
    options: [
      { code: "RT5", vialSize: "5mg", priceUsd: 70, inStock: true },
      { code: "RT10", vialSize: "10mg", priceUsd: 110, inStock: true },
      { code: "RT15", vialSize: "15mg", priceUsd: 160 },
      { code: "RT20", vialSize: "20mg", priceUsd: 200 },
      { code: "RT30", vialSize: "30mg", priceUsd: 300 },
    ],
  },
  {
    id: "selank",
    name: "Selank",
    options: [
      { code: "SK5", vialSize: "5mg", priceUsd: 70, inStock: true },
      { code: "SK10", vialSize: "10mg", priceUsd: 90 },
    ],
  },
  {
    id: "semax",
    name: "Semax",
    options: [
      { code: "XA5", vialSize: "5mg", priceUsd: 70, inStock: true },
      { code: "XA10", vialSize: "10mg", priceUsd: 90 },
    ],
  },
  {
    id: "snap8",
    name: "Snap8",
    options: [{ code: "NP810", vialSize: "10mg", priceUsd: 70 }],
  },
  {
    id: "ss31",
    name: "SS31",
    options: [
      { code: "2S10", vialSize: "10mg", priceUsd: 85 },
      { code: "2S50", vialSize: "50mg", priceUsd: 180, inStock: true },
    ],
  },
  {
    id: "tb500",
    name: "TB500",
    options: [{ code: "TB5", vialSize: "5mg", priceUsd: 80 }],
  },
  {
    id: "tesamorelin",
    name: "Tesamorelin",
    options: [
      { code: "TSM5", vialSize: "5mg", priceUsd: 85, inStock: true },
      { code: "TSM10", vialSize: "10mg", priceUsd: 140 },
      { code: "TSM20", vialSize: "20mg", priceUsd: 200 },
    ],
  },
  {
    id: "tirzepatide",
    name: "Tirzepatide",
    options: [
      { code: "TR5", vialSize: "5mg", priceUsd: 60 },
      { code: "TR20", vialSize: "20mg", priceUsd: 150 },
    ],
  },
  {
    id: "vip",
    name: "VIP",
    options: [{ code: "VIP5", vialSize: "5mg", priceUsd: 75 }],
  },
  {
    id: "wolverine-blend",
    name: "Wolverine Blend (BPC157/TB500)",
    options: [{ code: "BB10", vialSize: "10mg", priceUsd: 90, inStock: true }],
  },
];
