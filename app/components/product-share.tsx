"use client";

import { useState } from "react";
import { showToast } from "./toast";

async function copyCurrentUrl() {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const field = document.createElement("textarea");
  field.value = url;
  field.setAttribute("readonly", "true");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

export function ProductShare({ productName }: { productName: string }) {
  const [shared, setShared] = useState(false);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: productName, text: `Take a look at ${productName}.`, url: window.location.href });
      } else {
        await copyCurrentUrl();
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      }
      showToast(navigator.share ? "Share sheet opened." : "Product link copied.", "info");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      showToast("This product link could not be shared.", "error");
    }
  }

  return <button type="button" className="product-share" onClick={() => void share()} aria-label={`Share ${productName}`}><span aria-hidden="true">↗</span>{shared ? "Copied" : "Share this piece"}</button>;
}
