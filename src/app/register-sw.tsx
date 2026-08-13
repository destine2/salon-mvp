"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that caches the app shell (public/sw.js).
 *
 * Kept out of the root layout's server component so the layout stays static.
 * Registration is deliberately deferred to the load event: on the 2G/3G
 * connections this app targets, competing with the first render for bandwidth
 * makes the initial paint slower, which is the opposite of the goal.
 *
 * Skipped in development, where an aggressive cache mostly serves stale builds.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A failed registration must never break the app — it only costs
        // offline support, so there is nothing useful to show the user.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
