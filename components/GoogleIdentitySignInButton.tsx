"use client";

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { firebaseClientAuth, googleIdentityProvider } from "@/lib/client/firebaseClient";

export function GoogleIdentitySignInButton() {
  const [status, setStatus] = useState<"idle" | "working" | "failed">("idle");

  const signIn = async () => {
    setStatus("working");
    try {
      const credential = await signInWithPopup(firebaseClientAuth(), googleIdentityProvider());
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("session-creation-failed");
      window.location.assign("/workspace");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={status === "working"}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 text-sm font-black text-zinc-900">G</span>
        {status === "working" ? "確認中…" : "Googleで続ける"}
      </button>
      {status === "failed" ? <p role="alert" className="mt-2 text-xs text-red-300">ログインを完了できませんでした。</p> : null}
    </div>
  );
}
