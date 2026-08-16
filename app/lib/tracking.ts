export function trackingUrl(value: string | null | undefined) {
  const tracking = value?.trim() || "";
  if (!tracking) return null;
  const encoded = encodeURIComponent(tracking);
  if (/^1Z/i.test(tracking)) return `https://www.ups.com/track?tracknum=${encoded}`;
  if (/^9\d{15,21}$/.test(tracking)) return `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=2&text=${encoded}`;
  if (/^\d{10,15}$/.test(tracking)) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  if (/^(JD|GM|LX|RX)/i.test(tracking)) return `https://mydhl.express.dhl/en/tracking.html?AWB=${encoded}`;
  return null;
}
