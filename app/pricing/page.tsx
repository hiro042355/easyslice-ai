const plans = [
  {
    name: "Free",
    label: "",
    price: "¥0",
    period: "",
    accent: "zinc",
    features: [
      "Creator Flow",
      "Subtitle Editor",
      "Basic Export",
      "Community Support",
    ],
  },
  {
    name: "Pro",
    label: "Recommended",
    price: "¥1,980",
    period: "/ month",
    accent: "cyan",
    features: [
      "Everything in Free",
      "Creator Style",
      "Priority Export",
      "Advanced Subtitle",
      "Analytics",
    ],
  },
  {
    name: "Autopilot",
    label: "Most Powerful",
    badge: "Coming Soon",
    price: "¥2,980",
    period: "/ month",
    accent: "purple",
    features: [
      "Everything in Pro",
      "Creator Autopilot",
      "AI Recommended Posting Time",
      "Auto Schedule",
      "Future AI Features",
    ],
  },
  {
    name: "Enterprise",
    label: "Custom",
    price: "Contact Us",
    period: "",
    accent: "green",
    features: [
      "Team Workspace",
      "Brand Style",
      "Priority Support",
      "API Access",
    ],
  },
];

const faqs = [
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Paid plans are designed to be flexible when billing becomes available.",
  },
  {
    question: "Will Autopilot automatically post videos?",
    answer:
      "Currently Preview Only. Autopilot does not automatically publish videos without creator confirmation.",
  },
  {
    question: "Will prices change?",
    answer:
      "Pricing may change as NEXCUT grows. Open Beta feedback will guide the final plan structure.",
  },
];

function cardClass(accent: string) {
  if (accent === "cyan") {
    return "border-cyan-300/35 bg-cyan-300/[0.08] shadow-cyan-950/30";
  }

  if (accent === "purple") {
    return "border-fuchsia-300/25 bg-fuchsia-300/[0.07] shadow-fuchsia-950/25";
  }

  if (accent === "green") {
    return "border-emerald-300/20 bg-emerald-300/[0.06] shadow-emerald-950/20";
  }

  return "border-white/10 bg-zinc-950/75 shadow-black/25";
}

function labelClass(accent: string) {
  if (accent === "cyan") {
    return "border-cyan-300/30 bg-cyan-300/10 text-cyan-200";
  }

  if (accent === "purple") {
    return "border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-200";
  }

  if (accent === "green") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  }

  return "border-white/10 bg-white/[0.05] text-gray-300";
}

export default function PricingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_80%_24%,rgba(168,85,247,0.1),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_52%,#06111f_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-white/10 pb-8">
          <a
            href="/workspace"
            className="text-xs font-bold text-cyan-300 transition hover:text-cyan-200"
          >
            ← Workspace Home
          </a>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Pricing
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
            Choose the plan that fits your workflow.
          </h1>
        </header>

        <div className="grid gap-4 py-8 lg:grid-cols-4">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`flex min-h-[430px] flex-col rounded-2xl border p-6 shadow-2xl backdrop-blur-xl ${cardClass(
                plan.accent
              )}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    {plan.name}
                  </h2>
                  {plan.label && (
                    <p className="mt-2 text-sm font-bold text-gray-300">
                      {plan.label}
                    </p>
                  )}
                </div>

                {plan.badge && (
                  <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-fuchsia-200">
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Price
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-4xl font-black text-white">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="pb-1 text-sm font-semibold text-gray-400">
                      {plan.period}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                {plan.features.map((feature) => (
                  <div
                    key={feature}
                    className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-gray-200"
                  >
                    {feature}
                  </div>
                ))}
              </div>

              <div
                className={`mt-auto rounded-full border px-3 py-2 text-center text-xs font-black uppercase tracking-[0.16em] ${labelClass(
                  plan.accent
                )}`}
              >
                {plan.badge ?? plan.label ?? plan.name}
              </div>
            </article>
          ))}
        </div>

        <section className="rounded-2xl border border-white/10 bg-zinc-950/75 p-6 shadow-2xl shadow-black/25 backdrop-blur-xl">
          <h2 className="text-2xl font-black tracking-tight text-white">FAQ</h2>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-xl border border-white/10 bg-black/25 p-4"
              >
                <p className="text-sm font-black text-white">{faq.question}</p>
                <p className="mt-3 text-sm leading-6 text-gray-400">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-auto border-t border-white/10 pt-6 text-sm leading-7 text-gray-400">
          Pricing is shown for product validation. Stripe and billing are not
          connected yet.
        </footer>
      </section>
    </main>
  );
}
