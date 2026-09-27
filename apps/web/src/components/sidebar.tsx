'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/requirements', label: 'Requirements & Specs' },
  { href: '/test-generator', label: 'AI Test Generator' },
  { href: '/test-cases', label: 'Test Suites & Cases' },
  { href: '/test-runs', label: 'Test Runs' },
  { href: '/failure-analyzer', label: 'Failure Analyzer' },
  { href: '/bug-tracker', label: 'Bug Tracker' },
  { href: '/reports', label: 'Reports' },
  { href: '/test-history', label: 'Test History' },
  { href: '/settings', label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-accent/10 font-mono text-sm font-bold text-accent">
          Q
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide">QAPipeX</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
            AI QA Pipeline
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-4">
        <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
          Workspace Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-2 py-2 text-sm transition ${
                isActive
                  ? 'bg-surface-raised text-foreground'
                  : 'text-muted hover:bg-surface-raised hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
