"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Global application error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <section style={{ maxWidth: 420, border: "1px solid #d8dee4", borderRadius: 8, padding: 24 }}>
            <p style={{ margin: 0, color: "#0f766e", fontWeight: 700 }}>PMDInv</p>
            <h1 style={{ margin: "12px 0 8px", fontSize: 24 }}>The app needs a refresh.</h1>
            <p style={{ margin: 0, color: "#57606a", lineHeight: 1.5 }}>A top-level error was caught. Refresh the page or return to the dashboard.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={reset} style={{ border: 0, borderRadius: 6, background: "#0f766e", color: "white", padding: "10px 14px", fontWeight: 700 }}>
                Try again
              </button>
              <button type="button" onClick={() => window.location.assign("/dashboard")} style={{ border: "1px solid #d8dee4", borderRadius: 6, background: "white", color: "#24292f", padding: "10px 14px", fontWeight: 700 }}>
                Dashboard
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
