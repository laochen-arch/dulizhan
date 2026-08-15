export function normalizeCurrencyCode(value: unknown, fallback = "USD") {
  return typeof value === "string" && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : fallback;
}

export function formatMoney(amount: number, currency: unknown = "USD") {
  const code = normalizeCurrencyCode(currency);
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}
