"use client";

import Link from "./site-link";
import { useStore } from "./cart-store";
import { useSiteRuntime } from "./site-runtime";
import { formatMoney } from "../lib/format-money";
import { showToast } from "./toast";
import { trackAnalytics } from "./analytics-tracker";

export function SavedForLater({ scope }: { scope: string }) {
  const { config } = useSiteRuntime();
  const { saved, hydrated, moveToCart, removeSaved } = useStore(scope);
  if (!hydrated || !saved.length) return null;

  return <section className="saved-for-later" aria-labelledby="saved-for-later-title">
    <div className="cart-section-heading"><div><p className="eyebrow">Keep it close</p><h2 id="saved-for-later-title">Saved for later.</h2></div><span>{saved.length} {saved.length === 1 ? "item" : "items"}</span></div>
    <div className="saved-for-later-list">
      {saved.map((item) => {
        const available = item.variants.find((variant) => variant.id === item.variantId)?.available !== false && (item.variants.find((variant) => variant.id === item.variantId)?.stock ?? item.stock) > 0;
        return <article className="saved-for-later-line" key={item.lineId}>
          <Link href={`/products/${item.slug}`} className="saved-for-later-image"><img src={item.images[0] || item.image} alt={item.alt} loading="lazy" /></Link>
          <div><p className="eyebrow">{item.category}</p><Link href={`/products/${item.slug}`} className="saved-for-later-name">{item.name}</Link><p>{item.variantLabel} · {formatMoney(item.variantPrice, config.commerce.currency)}</p></div>
      <div className="saved-for-later-actions"><button type="button" className="text-button" disabled={!available} onClick={() => { if (moveToCart(item.lineId)) { trackAnalytics("saved_item_moved_to_cart", { payload: { productId: item.id } }); showToast(`${item.name} moved to your bag.`); } else showToast("This item is no longer available.", "error"); }}>{available ? "Move to bag" : "Unavailable"}</button><button type="button" className="text-button danger" onClick={() => { removeSaved(item.lineId); trackAnalytics("saved_item_removed", { payload: { productId: item.id } }); showToast(`${item.name} removed from saved items.`, "info"); }}>Remove</button></div>
        </article>;
      })}
    </div>
  </section>;
}
