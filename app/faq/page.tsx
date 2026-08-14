import { siteConfig } from "../data/site-config";

export const metadata = { title: "FAQ" };

const questions = [
  ["Where do you ship?", "We currently ship to the United States, Canada, the United Kingdom, and Australia. If you are somewhere else, send us a note and we will see what we can do."],
  ["How long will my order take?", siteConfig.content.policies.deliveryLead],
  ["What is your return policy?", siteConfig.content.policies.returnsLead],
  ["Are your materials recycled?", "Where it makes sense, yes. Our core nylon pieces use recycled fibers, and we continue to test lower-impact options without compromising durability."],
  ["Can I change my order?", `We move quickly, but email ${siteConfig.content.contact.email} as soon as possible. We will do our best to catch a change before the order leaves.`],
];

export default function FaqPage() {
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{siteConfig.brand.name} / {siteConfig.content.faq.label}</p><h1>{siteConfig.content.faq.titleLead}<br /><em>{siteConfig.content.faq.titleAccent}</em></h1><p>{siteConfig.content.faq.intro}</p></div><div className="faq-list">{questions.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>0{index + 1}</span>{question}<b>+</b></summary><p>{answer}</p></details>)}</div></div>;
}
