"use client";

import { useEffect, useState } from "react";

type ToastTone = "success" | "error" | "info";
type ToastPayload = { message: string; tone?: ToastTone };

const TOAST_EVENT = "northline-toast";

export function showToast(message: string, tone: ToastTone = "success") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, tone } }));
}

export function ToastViewport() {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      setToast({ ...detail, id: Date.now() });
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 2800);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;
  return <div className={`toast toast-${toast.tone || "success"}`} role={toast.tone === "error" ? "alert" : "status"} key={toast.id}><span>{toast.tone === "error" ? "!" : "OK"}</span>{toast.message}<button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">x</button></div>;
}
