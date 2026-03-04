export const IMAGE_PRICING: Record<number, number> = Object.fromEntries(
  Array.from({ length: 50 }, (_, i) => [i + 1, (i + 1) * 16]),
);
