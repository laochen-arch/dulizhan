"use client";

import { useEffect } from "react";
import { useSiteRuntime } from "./site-runtime";

function setMeta(selector: string, attribute: "name" | "property", value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, selector.slice(selector.indexOf("=") + 2, -2));
    document.head.appendChild(element);
  }
  element.content = value;
}

export function TenantMetadata() {
  const { config, site } = useSiteRuntime();

  useEffect(() => {
    const title = `${config.brand.name} - ${config.brand.tagline}`;
    document.title = title;
    setMeta('meta[name="description"]', "name", config.seo.description);
    setMeta('meta[name="keywords"]', "name", config.seo.keywords);
    setMeta('meta[property="og:title"]', "property", title);
    setMeta('meta[property="og:description"]', "property", config.seo.description);
    setMeta('meta[property="og:site_name"]', "property", config.brand.name);
    setMeta('meta[property="og:url"]', "property", window.location.href);
    setMeta('meta[name="twitter:title"]', "name", title);
    setMeta('meta[name="twitter:description"]', "name", config.seo.description);
    setMeta('meta[name="tenant-site-id"]', "name", site?.id || "default");
  }, [config, site]);

  return null;
}
