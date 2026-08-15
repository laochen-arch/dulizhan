import type { AnchorHTMLAttributes } from "react";

type SiteLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

/**
 * Use the browser's native navigation for storefront links.
 *
 * Vinext's current Link prefetch runtime can fail before a click is handled,
 * so a plain anchor keeps every public storefront route reliable in both the
 * published Site and the local preview.
 */
export default function SiteLink({ href, children, ...props }: SiteLinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
