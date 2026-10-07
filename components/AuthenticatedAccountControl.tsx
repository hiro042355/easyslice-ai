"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { firebaseClientAuth } from "@/lib/client/firebaseClient";
import { restoreServerSession } from "@/lib/client/restoredServerSession";

export function AuthenticatedAccountControl() {
  const [status, setStatus] = useState<"checking" | "idle" | "working" | "failed">("checking");
  const pending = useRef<Promise<void> | null>(null);
  const loggingOut = useRef(false);

  useEffect(() => {
    let active = true;
    const check = () => {
      if (!active || loggingOut.current || pending.current) return;
      setStatus("checking");
      const flight = (async () => {
        const result = await restoreServerSession({
          checkSession: () => fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" }),
          restoredUser: async () => {
            const auth = firebaseClientAuth();
            await auth.authStateReady();
            return active && !loggingOut.current ? auth.currentUser : null;
          },
          createSession: (idToken) => fetch("/api/auth/session", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
            credentials: "same-origin",
            cache: "no-store",
          }),
        });
        if (!active || loggingOut.current) return;
        if (result === "authenticated") {
          setStatus("idle");
        } else if (result === "unauthenticated" || result === "forbidden") {
          await signOut(firebaseClientAuth()).catch(() => undefined);
          if (active && !loggingOut.current) window.location.replace("/auth");
        } else {
          setStatus("failed");
        }
      })().catch(() => {
        if (active && !loggingOut.current) setStatus("failed");
      });
      pending.current = flight;
      void flight.finally(() => { if (pending.current === flight) pending.current = null; });
    };
    if (pending.current) void pending.current.then(check); else check();
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 60_000);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  const logout = async () => {
    loggingOut.current = true;
    setStatus("working");
    try {
      // Finish any cookie exchange before clearing it, so recovery cannot undo logout.
      await pending.current;
      const response = await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("session-logout-failed");
      await signOut(firebaseClientAuth());
      window.location.assign("/auth");
    } catch {
      setStatus("failed");
      loggingOut.current = false;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-500">
        {status === "idle" ? "Signed in" : status === "working" ? "Signing out…" : "Checking session…"}
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={status !== "idle"}
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60"
      >
        {status === "working" ? "ログアウト中…" : "ログアウト"}
      </button>
      {status === "failed" ? <span role="alert" className="text-xs text-red-300">セッションを確認できませんでした</span> : null}
    </div>
  );
}
