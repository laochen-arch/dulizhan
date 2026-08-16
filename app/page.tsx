"use client";

import Link from "./components/site-link";
import { NewsletterForm } from "./components/newsletter-form";
import { ProductCard } from "./components/product-card";
import { useSiteRuntime } from "./components/site-runtime";

export default function Home() {
  const { config, catalog } = useSiteRuntime();
  const activeProducts = catalog.filter((product) => product.status === "active");
  const brandName = config.brand.name.trim().split(/\s+/)[0];
  const modules = new Set(config.content.home.modules);
  const categories = Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean)));
  const featuredProducts = activeProducts.filter((product) => product.featured);
  const discoveryProducts = activeProducts.filter((product) => !product.featured);

  return <div className="storefront-appstore appstore-home">
    {modules.has("hero") && <section className="appstore-hero-section container">
      <div className="appstore-section-heading">
        <div><p className="appstore-kicker">Today <span>/</span> {config.content.home.heroLabel}</p><h1>{config.content.home.heroTitleLead}<br /><em>{config.content.home.heroTitleAccent}</em></h1></div>
        <Link href="/shop" className="appstore-text-link">{config.content.home.heroCta} <span>↗</span></Link>
      </div>
      <div className="appstore-hero-card" style={{ backgroundImage: `url(${config.assets.hero})` }}>
        <div className="appstore-hero-overlay" />
        <div className="appstore-hero-content">
          <p className="eyebrow eyebrow-light">{config.content.home.heroLabel}</p>
          <p>{config.content.home.heroBody}</p>
          <Link href="/shop" className="button button-light">Browse the collection <span>↗</span></Link>
        </div>
        <div className="appstore-hero-footer"><span>01 / 04</span><span>The art of getting there</span></div>
      </div>
    </section>}

    {modules.has("intro") && <section className="appstore-discovery container section-pad">
      <div className="appstore-section-heading compact">
        <div><p className="appstore-kicker">Explore by purpose</p><h2>{config.content.home.introTitleLead}<br /><em>{config.content.home.introTitleAccent}</em></h2></div>
        <p className="appstore-section-note">{config.content.home.introBody}</p>
      </div>
      <div className="appstore-category-rail" aria-label="Shop by category">
        {categories.map((category, index) => {
          const categoryProduct = activeProducts.find((product) => product.category === category);
          return <Link href={`/shop?category=${encodeURIComponent(category)}`} className="appstore-category-card" key={category}>
            <span className="appstore-category-index">0{index + 1}</span>
            <span className="appstore-category-icon" aria-hidden="true">{category.charAt(0)}</span>
            <span className="appstore-category-copy"><strong>{category}</strong><small>{activeProducts.filter((product) => product.category === category).length} essentials</small></span>
            {categoryProduct && <img src={categoryProduct.images[0] || categoryProduct.image} alt="" />}
            <span className="appstore-category-arrow" aria-hidden="true">↗</span>
          </Link>;
        })}
      </div>
    </section>}

    {modules.has("products") && <section className="appstore-rail-section appstore-rail-section-tinted section-pad">
      <div className="container">
        <div className="appstore-section-heading compact">
          <div><p className="appstore-kicker">{config.content.home.productsLabel}</p><h2>{config.content.home.productsTitleLead}<br /><em>{config.content.home.productsTitleAccent}</em></h2></div>
          <Link href="/shop" className="appstore-text-link">Shop all gear <span>↗</span></Link>
        </div>
        <div className="appstore-product-rail" aria-label="Featured products">
          {featuredProducts.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} variant="rail" />)}
        </div>
      </div>
    </section>}

    {modules.has("story") && <section className="appstore-feature-section container section-pad">
      <div className="appstore-feature-grid">
        <div className="appstore-feature-image"><img src={config.assets.story} alt="Mist moving through a mountain valley" /></div>
        <div className="appstore-feature-copy"><p className="appstore-kicker">{config.content.home.storyLabel}</p><h2>{config.content.home.storyTitleLead}<br /><em>{config.content.home.storyTitleAccent}</em></h2><p>{config.content.home.storyBody}</p><Link href="/about" className="button button-outline">Why {brandName} <span>↗</span></Link></div>
      </div>
    </section>}

    {discoveryProducts.length > 0 && <section className="appstore-rail-section container section-pad appstore-discovery-rail">
      <div className="appstore-section-heading compact"><div><p className="appstore-kicker">Keep exploring</p><h2>More to take<br /><em>with you.</em></h2></div><Link href="/shop" className="appstore-text-link">See the full store <span>↗</span></Link></div>
      <div className="appstore-product-rail" aria-label="More products">{discoveryProducts.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} variant="rail" />)}</div>
    </section>}

    {modules.has("journal") && <section className="appstore-editorial-section section-pad"><div className="container"><div className="appstore-section-heading compact"><div><p className="appstore-kicker">{config.content.home.journalLabel}</p><h2>{config.content.home.journalTitleLead}<br /><em>{config.content.home.journalTitleAccent}</em></h2></div><Link href="/faq" className="appstore-text-link">More notes <span>↗</span></Link></div><div className="appstore-editorial-grid"><Link href="/shipping" className="appstore-editorial-card appstore-editorial-card-large"><img src={config.assets.journalHero} alt="Hiker looking across a mountain landscape" /><div><span>Field notes / 06.12.24</span><h3>How to pack for the version of a trip you can&apos;t predict.</h3><span className="appstore-text-link">Read article <span>↗</span></span></div></Link><div className="appstore-editorial-list"><Link href="/faq" className="appstore-editorial-row"><span>01</span><div><small>Good questions</small><strong>What makes a piece worth carrying?</strong></div><span>↗</span></Link><Link href="/shipping" className="appstore-editorial-row"><span>02</span><div><small>On the way</small><strong>Our approach to less wasteful shipping.</strong></div><span>↗</span></Link><Link href="/about" className="appstore-editorial-row"><span>03</span><div><small>From the archive</small><strong>A field guide to the {config.brand.name} color palette.</strong></div><span>↗</span></Link></div></div></div></section>}
    {modules.has("newsletter") && <section className="appstore-newsletter-section"><div className="container appstore-newsletter"><p className="appstore-kicker">{config.content.home.newsletterLabel}</p><h2>{config.content.home.newsletterTitleLead}<br /><em>{config.content.home.newsletterTitleAccent}</em></h2><p>{config.content.home.newsletterBody}</p><NewsletterForm /><small>By subscribing, you agree to our terms. No noise, ever.</small></div></section>}
  </div>;
}
