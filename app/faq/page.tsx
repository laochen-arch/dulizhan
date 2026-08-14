export const metadata = { title: "FAQ" };
import { siteConfig } from "../data/site-config";

const questions = [
  ["Where do you ship?", "We currently ship to the United States, Canada, the United Kingdom, and Australia. If you’re somewhere else, send us a note and we’ll see what we can do."],
  ["How long will my order take?", "Orders leave our studio within 1–2 business days. Standard US delivery typically takes 3–5 business days after dispatch."],
  ["What is your return policy?", "Try your Northline piece for 30 days. If it is not the right fit, contact us for a return label. Items should be unused and in original condition."],
  ["Are your materials recycled?", "Where it makes sense, yes. Our core nylon pieces use recycled fibers, and we continue to test lower-impact options without compromising durability."],
  ["Can I change my order?", "We move quickly, but email hello@northlinesupply.com as soon as possible. We’ll do our best to catch a change before the order leaves."],
];

export default function FaqPage() {
  return <div className="simple-page container section-pad"><div className="page-intro"><p className="eyebrow">{siteConfig.brand.name} / Good questions</p><h1>We’ll keep<br /><em>it simple.</em></h1><p>The useful answers, without the fine-print fog.</p></div><div className="faq-list">{questions.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>0{index + 1}</span>{question}<b>+</b></summary><p>{answer}</p></details>)}</div></div>;
}
