"use client";

import { useSiteRuntime } from "../components/site-runtime";

export default function FaqPage() {
  const { config } = useSiteRuntime();
  const questions = [["Where do you ship?", "We currently ship to the United States, Canada, the United Kingdom, and Australia. If you are somewhere else, send us a note and we will see what we can do."], ["How long will my order take?", config.content.policies.deliveryLead], ["What is your return policy?", config.content.policies.returnsLead], ["Are your materials recycled?", "Where it makes sense, yes. Our core nylon pieces use recycled fibers, and we continue to test lower-impact options without compromising durability."], ["Can I change my order?", `We move quickly, but email ${config.content.contact.email} as soon as possible. We will do our best to catch a change before the order leaves.`]];
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{config.brand.name} / {config.content.faq.label}</p><h1>{config.content.faq.titleLead}<br /><em>{config.content.faq.titleAccent}</em></h1><p>{config.content.faq.intro}</p></div><div className="faq-list">{questions.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>0{index + 1}</span>{question}<b>+</b></summary><p>{answer}</p></details>)}</div></div>;
}
