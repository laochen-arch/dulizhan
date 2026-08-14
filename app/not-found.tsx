import Link from "next/link";

export default function NotFound() { return <div className="empty-state container section-pad"><span className="empty-mark">↗</span><p className="eyebrow">404 / Off route</p><h1>That way is<br /><em>not mapped.</em></h1><p>Let’s get you back to somewhere useful.</p><Link href="/shop" className="button button-dark">Browse the collection</Link></div>; }

