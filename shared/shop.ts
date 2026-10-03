// Customer shop front: categories offered when setting up a product (admin can also add their own).
// Matches the Peptide Database's category tags so the two read the same.
export const DEFAULT_SHOP_CATEGORIES = [
  "Anabolic",
  "Cardiovascular",
  "Cognitive",
  "Growth Hormone",
  "Healing",
  "Hormonal",
  "Immune",
  "Longevity",
  "Metabolic",
  "Performance",
  "Sexual Health",
  "Skin",
  "Sleep",
  "Weight Loss",
  "Supplies",
];

// "weight-loss" (Peptide Database tag) -> "Weight Loss"
export function categoryLabel(tag: string): string {
  return tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Cleans a category list: trimmed, no blanks, no duplicates (ignoring case).
export function normalizeCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of categories) {
    const category = raw.trim();
    if (!category || seen.has(category.toLowerCase())) continue;
    seen.add(category.toLowerCase());
    result.push(category);
  }
  return result;
}

// Product images are resized in the browser before upload, so this is a generous ceiling.
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 8;
