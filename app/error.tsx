"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="empty-state container section-pad"><span className="empty-mark">!</span><p className="eyebrow">Something went off route</p><h1>Let&apos;s try<br /><em>that again.</em></h1><p>The storefront could not finish loading this page. Your bag remains saved on this device.</p><div className="checkout-result-actions"><button type="button" className="button button-dark" onClick={() => reset()}>Retry</button><a href="/shop" className="button button-outline">Browse products</a></div></div>;
}
