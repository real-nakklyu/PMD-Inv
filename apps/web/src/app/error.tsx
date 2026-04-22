"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold text-primary">PMDInv</p>
        <h1 className="mt-3 text-2xl font-semibold">Something did not load correctly.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The app caught the problem before it could break the rest of your session. Try again, and if it repeats, check the Vercel logs with the time it happened.
        </p>
        <div className="mt-5 flex gap-2">
          <Button type="button" onClick={reset}>Try again</Button>
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => window.location.assign("/dashboard")}>
            Dashboard
          </Button>
        </div>
      </section>
    </main>
  );
}
