import Link from "next/link";

const features = [
  {
    title: "Instant CV insights",
    description: "AI-powered scoring that highlights strengths, gaps, and next steps in seconds.",
  },
  {
    title: "Cloud-first uploads",
    description:
      "Files go straight from the browser to Cloudinary (unsigned preset). The dashboard only stores metadata.",
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
    <div className="bg-gradient-to-b from-[#f8fafc] via-white to-white text-[#0f172a]">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-24 px-6 pb-24 pt-24 sm:px-10">
        <section className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div className="space-y-8">
            <span className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-white px-4 py-1 text-sm font-medium uppercase tracking-[0.2em] text-[#475569]">
              CVATS
            </span>
            <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-5xl">
              Understand every resume at a glance.
            </h1>
            <p className="max-w-xl text-lg text-[#334155] sm:text-xl">
              CVATS turns uploads into rich candidate analysis without handling raw files on the
              server. Deliver fast, compliant insights for recruiters and hiring teams.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/dashboard"
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#2563eb] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] sm:w-auto"
              >
                View dashboard preview
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex w-full items-center justify-center rounded-lg border border-[#cbd5f5] px-6 py-3 text-sm font-semibold text-[#1e3a8a] transition hover:border-[#94a3b8] hover:text-[#1d4ed8] sm:w-auto"
              >
                See how CVATS works
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-[#e2e8f0] bg-white p-8 shadow-xl shadow-[#2563eb1a]">
            <h2 className="text-sm font-semibold uppercase tracking-[0.25em] text-[#1e40af]">
              Recruiter View
            </h2>
            <p className="mt-5 text-lg font-medium text-[#1e293b]">1 resume uploaded • 86% match</p>
            <ul className="mt-6 space-y-4 text-sm text-[#475569]">
              {steps.map((step) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-1 inline-flex h-2.5 w-2.5 flex-none rounded-full bg-[#2563eb]" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="space-y-10">
          <div className="space-y-4 text-center">
            <h2 id="features-heading" className="text-3xl font-semibold text-[#0f172a]">
              Why talent teams choose CVATS
            </h2>
            <p className="mx-auto max-w-2xl text-[#475569]">
              Built for agencies and in-house recruiters who need trustworthy CV intelligence without
              manual review.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-[#e2e8f0] bg-white p-6 text-left shadow-sm transition hover:shadow-lg"
              >
                <h3 className="text-lg font-semibold text-[#0f172a]">{feature.title}</h3>
                <p className="mt-3 text-sm text-[#475569]">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="rounded-3xl border border-[#cbd5f5] bg-[#eef2ff] px-8 py-12 text-center"
        >
          <h2 className="text-3xl font-semibold text-[#1e3a8a]">
            Secure uploads, insightful output.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[#1e40af]">
            Resume files are delivered straight to Cloudinary via an unsigned preset. The CVATS
            server stores only URLs, metadata, and analysis summaries so you remain compliant and
            ready to scale.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#1e40af] shadow-sm transition hover:shadow-lg"
            >
              Open dashboard preview
            </Link>
            <Link
              href="mailto:hello@cvats.ai"
              className="inline-flex items-center justify-center rounded-lg border border-[#1e3a8a] px-6 py-3 text-sm font-semibold text-[#1e3a8a] transition hover:bg-[#e0e7ff]"
            >
              Talk to our team
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
