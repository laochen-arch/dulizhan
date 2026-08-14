import Link from "next/link";
import { ProductCard } from "./components/product-card";
import { NewsletterForm } from "./components/newsletter-form";
import { activeProducts } from "./data/products";
import { siteConfig } from "./data/site-config";

export default function Home() {
  return <>
    <section className="hero-section">
      <div className="hero-visual" style={{ backgroundImage: `url(${siteConfig.assets.hero})` }}>
        <div className="hero-overlay" />
        <div className="container hero-content">
          <p className="eyebrow eyebrow-light">{siteConfig.content.home.heroLabel}</p>
          <h1>{siteConfig.content.home.heroTitleLead}<br /><em>{siteConfig.content.home.heroTitleAccent}</em></h1>
          <p className="hero-copy">{siteConfig.content.home.heroBody}</p>
          <Link href="/shop" className="button button-light">{siteConfig.content.home.heroCta} <span>↗</span></Link>
        </div>
        <div className="hero-caption">01 / 04 &nbsp; — &nbsp; The art of getting there</div>
      </div>
    </section>

    <section className="intro-section container section-pad">
      <div className="section-kicker"><span>01</span><span>{siteConfig.content.home.introLabel}</span></div>
      <div className="intro-grid"><h2>{siteConfig.content.home.introTitleLead}<br /><em>{siteConfig.content.home.introTitleAccent}</em></h2><div><p className="lead">{siteConfig.content.home.introBody}</p><Link href="/about" className="text-link">Read our story <span>↗</span></Link></div></div>
    </section>

    <section className="product-section section-pad">
      <div className="container"><div className="section-heading"><div><p className="eyebrow">The essentials</p><h2>Take only<br /><em>what matters.</em></h2></div><Link href="/shop" className="text-link">Shop all gear <span>↗</span></Link></div><div className="product-grid home-product-grid">{activeProducts.filter((product) => product.featured).slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)}</div></div>
    </section>

    <section className="split-story container section-pad">
      <div className="story-image"><img src={siteConfig.assets.story} alt="Mist moving through a mountain valley" /></div>
      <div className="story-copy"><p className="eyebrow">{siteConfig.content.home.storyLabel}</p><h2>{siteConfig.content.home.storyTitleLead}<br /><em>{siteConfig.content.home.storyTitleAccent}</em></h2><p>{siteConfig.content.home.storyBody}</p><Link href="/about" className="button button-outline">Why {siteConfig.brand.name.split(" ")[0]} <span>↗</span></Link></div>
    </section>

    <section className="journal-section section-pad"><div className="container"><div className="section-heading"><div><p className="eyebrow">From the journal</p><h2>Notes for<br /><em>the road ahead.</em></h2></div><Link href="/faq" className="text-link">More notes <span>↗</span></Link></div><div className="journal-grid"><Link href="/shipping" className="journal-card journal-card-large"><img src={siteConfig.assets.journalHero} alt="Hiker looking across a mountain landscape" /><div><span>Field notes / 06.12.24</span><h3>How to pack for the version of a trip you can’t predict.</h3><span className="text-link">Read article ↗</span></div></Link><div className="journal-list"><Link href="/faq" className="journal-small"><span>01</span><div><span>Good questions</span><h3>What makes a piece worth carrying?</h3></div><span>↗</span></Link><Link href="/shipping" className="journal-small"><span>02</span><div><span>On the way</span><h3>Our approach to less wasteful shipping.</h3></div><span>↗</span></Link><Link href="/about" className="journal-small"><span>03</span><div><span>From the archive</span><h3>A field guide to the Northline color palette.</h3></div><span>↗</span></Link></div></div></div></section>

    <section className="newsletter-section"><div className="container newsletter-inner"><p className="eyebrow eyebrow-light">{siteConfig.content.home.newsletterLabel}</p><h2>{siteConfig.content.home.newsletterTitleLead}<br /><em>{siteConfig.content.home.newsletterTitleAccent}</em></h2><p>{siteConfig.content.home.newsletterBody}</p><NewsletterForm /><small>By subscribing, you agree to our terms. No noise, ever.</small></div></section>
  </>;
}
