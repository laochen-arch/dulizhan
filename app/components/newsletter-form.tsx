"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [subscribed, setSubscribed] = useState(false);
  return subscribed ? <p className="newsletter-success">You’re on the list — see you out there.</p> : <form className="newsletter-form" onSubmit={(event) => { event.preventDefault(); setSubscribed(true); }}><label className="sr-only" htmlFor="home-email">Email address</label><input id="home-email" type="email" placeholder="Your email address" required /><button type="submit">Subscribe <span>↗</span></button></form>;
}

