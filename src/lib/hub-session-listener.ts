import { supabase } from "@/integrations/supabase/app-client";

const HUB_ORIGIN = "https://hub-ivory-eta.vercel.app";

declare global {
  interface Window {
    __luziaSessionListener?: boolean;
  }
}

export function initializeHubSessionListener() {
  if (typeof window === "undefined" || window.__luziaSessionListener) return;

  window.__luziaSessionListener = true;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== HUB_ORIGIN) return;
    const data = event.data as
      | { type?: string; access_token?: string; refresh_token?: string }
      | undefined;
    if (data?.type !== "LUZIA_SESSION") return;
    if (!data.access_token || !data.refresh_token) return;

    supabase.auth
      .setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })
      .catch((error) => console.error("[LUZIA_SESSION]", error));
  });

  // Avisa o hub que o app já está pronto para receber a sessão.
  try {
    window.parent?.postMessage({ type: "LUZIA_READY" }, HUB_ORIGIN);
  } catch {
    // ignora
  }
}

initializeHubSessionListener();

export {};
