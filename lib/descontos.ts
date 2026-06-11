export function normalizeDiscountPercent(value: unknown) {
  const percent = Number(value ?? 0);

  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Number(Math.min(Math.max(percent, 0), 100).toFixed(2));
}

export function normalizeCouponCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

export function calculateDiscountedSubtotal(baseValue: number, percent: number) {
  const safeBase = Number.isFinite(baseValue) ? Math.max(baseValue, 0) : 0;
  const safePercent = normalizeDiscountPercent(percent);
  const discountValue = Number(((safeBase * safePercent) / 100).toFixed(2));
  const subtotal = Number(Math.max(safeBase - discountValue, 0).toFixed(2));

  return {
    baseValue: Number(safeBase.toFixed(2)),
    discountPercent: safePercent,
    discountValue,
    subtotal,
  };
}
