import Link from "next/link";

const placeholderItems = [
  { label: "Uploads", value: "Coming soon" },
  { label: "Analyses", value: "Queued" },
  { label: "Automation", value: "In design" },
];

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold text-[#0f172a]">Dashboard preview</h1>
        <p className="text-[#475569]">
          This workspace is under construction. Soon you&apos;ll be able to track uploads, trigger AI
          analysis runs, and collaborate with your team.
        </p>
      </header>
      <section className="grid gap-4">
        {placeholderItems.map((item) => (
          <article
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-[#e2e8f0] bg-white px-5 py-4 shadow-sm"
          >
            <span className="text-sm font-medium text-[#1e293b]">{item.label}</span>
            <span className="text-sm text-[#64748b]">{item.value}</span>
          </article>
        ))}
      </section>
      <footer className="rounded-xl border border-dashed border-[#cbd5f5] bg-[#eef2ff] px-6 py-5 text-sm text-[#1e40af]">
        Want to test uploads today?{" "}
        <Link href="mailto:hello@cvats.ai" className="font-semibold hover:underline">
          Email the team for early access.
        </Link>
      </footer>
    </main>
  );
}
