import Link from "next/link";

const features = [
  {
    title: "Instant CV insights",
    description: "AI-powered scoring that highlights strengths, gaps, and next steps in seconds.",
  },
  {
    title: "Cloud-first uploads",
    description:
      "Files stream through our server to Cloudinary with signed credentials, keeping the client free of secrets.",
  },
  {
    title: "Collaboration-ready",
    description:
      "Share analyses securely with candidates, recruiters, and hiring teams across your organization.",
  },
];

const steps = [
  "Upload a PDF or DOCX resume with one click.",
  "Let CVATS stream metrics, summaries, and redactable highlights.",
  "Export actionable feedback or trigger follow-up workflows.",
];

export default function MarketingPage() {
  return (
    <div className="relative min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.22),_transparent_55%)]"
        aria-hidden
      />
      <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-24 px-6 pb-24 pt-24 sm:px-10">
        <section className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="space-y-8">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1 text-sm font-medium uppercase tracking-[0.2em] text-slate-200">
              CVATS
            </span>
            <div className="space-y-5 rounded-3xl border border-white/10 bg-white/10 p-8 backdrop-blur">
              <h1 className="text-balance text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Understand every resume at a glance.
              </h1>
              <p className="max-w-xl text-lg text-slate-200 sm:text-xl">
                CVATS turns uploads into rich candidate analysis while your raw files stay secured
                in Cloudinary under server-owned credentials. Deliver fast, compliant insights for
                recruiters and hiring teams.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 sm:w-auto"
                >
                  View dashboard preview
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
                >
                  See how CVATS works
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-200">
              <span className="rounded-full bg-white/10 px-4 py-2">Cloudinary uploads</span>
              <span className="rounded-full bg-white/10 px-4 py-2">AI insights</span>
              <span className="rounded-full bg-white/10 px-4 py-2">Team collaboration</span>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/10 p-8 text-slate-100 shadow-xl backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">
              Recruiter View
            </h2>
            <p className="mt-5 text-lg font-medium text-white">1 resume uploaded • 86% match</p>
            <ul className="mt-6 space-y-4 text-sm text-slate-200">
              {steps.map((step) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-blue-400" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="space-y-10">
          <div className="space-y-4 text-center">
            <h2 id="features-heading" className="text-3xl font-semibold text-white">
              Why talent teams choose CVATS
            </h2>
            <p className="mx-auto max-w-2xl text-slate-300">
              Built for agencies and in-house recruiters who need trustworthy CV intelligence without
              manual review.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/10 p-6 text-left text-slate-100 shadow-lg backdrop-blur transition hover:border-blue-300/30 hover:shadow-xl"
              >
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="rounded-3xl border border-white/15 bg-white/10 px-8 py-12 text-center text-slate-100 shadow-lg backdrop-blur"
        >
          <h2 className="text-3xl font-semibold text-white">
            Secure uploads, insightful output.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-200">
            Resume files stream through our API to Cloudinary using signed credentials. The CVATS
            server stores only URLs, metadata, and analysis summaries so you remain compliant and
            ready to scale.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Open dashboard preview
            </Link>
            <Link
              href="mailto:hello@cvats.ai"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Talk to our team
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
