import { PRIORITY_LABELS, STATUS_LABELS, type AnalyticsDTO } from '@workgrid/shared';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, FolderKanban, ListTodo } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { useUser } from '@/auth/AuthProvider';
import { PriorityIcon, StatusIcon } from '@/components/task-bits';
import { Card, PageHeader, PageLoader } from '@/components/ui';
import { Page } from '@/layouts/AppLayout';
import { useOrg } from '@/lib/org';
import { useAnalytics, useMyTasks } from '@/lib/queries';
import { cn, dueLabel } from '@/lib/utils';

const dayLabel = (iso: string) => format(new Date(`${iso}T00:00:00`), 'MMM d');

function StatTile({ label, value, icon, alert }: { label: string; value: number; icon: ReactNode; alert?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted">
        <span className="text-xs font-medium">{label}</span>
        <span className={cn('[&>svg]:size-4', alert && value > 0 ? 'text-danger' : 'text-subtle')}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p>
    </Card>
  );
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

const SERIES = [
  { key: 'created', label: 'Created', color: 'var(--series-1)' },
  { key: 'completed', label: 'Completed', color: 'var(--series-2)' },
] as const;

function ThroughputTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium">{dayLabel(String(label))}</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center gap-2 text-muted">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
          <span className="ml-auto pl-3 font-semibold text-fg tabular-nums">{payload.find((p) => p.dataKey === s.key)?.value ?? 0}</span>
        </p>
      ))}
    </div>
  );
}

function ThroughputChart({ data }: { data: AnalyticsDTO['throughput'] }) {
  return (
    <>
      <ul className="mb-3 flex gap-4 text-xs text-muted">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="h-56" role="img" aria-label="Line chart of tasks created and completed per day over the last 14 days. A data table follows.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={dayLabel}
              tickLine={false}
              axisLine={{ stroke: 'var(--line-strong)' }}
              tick={{ fill: 'var(--subtle)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--subtle)', fontSize: 11 }} />
            <Tooltip content={ThroughputTooltip} cursor={{ stroke: 'var(--line-strong)' }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Tasks created and completed per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Created</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{dayLabel(d.date)}</td>
              <td>{d.created}</td>
              <td>{d.completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Horizontal bars for one measure: a single hue, value labelled at the tip. */
function BarList({ rows, empty }: { rows: { key: string; label: ReactNode; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.every((r) => r.value === 0)) return <p className="py-6 text-center text-sm text-subtle">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2 truncate text-muted">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 min-w-0.5 rounded-r bg-series-1" style={{ width: `calc(${(r.value / max) * 100}% - 2rem)` }} />
            <span className="text-xs font-medium tabular-nums">{r.value}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function MyTasks() {
  const { org } = useOrg();
  const { data: tasks, isPending } = useMyTasks();
  if (isPending) return <PageLoader />;
  if (!tasks?.length) return <p className="py-6 text-center text-sm text-subtle">Nothing assigned to you. Enjoy the quiet.</p>;
  return (
    <ul className="-mx-2 divide-y divide-line">
      {tasks.slice(0, 8).map((t) => {
        const due = t.dueDate ? dueLabel(t.dueDate) : null;
        return (
          <li key={t.id}>
            <Link to={`/${org.slug}/projects/${t.projectId}?task=${t.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-hover">
              <StatusIcon status={t.status} />
              <span className="w-16 shrink-0 text-xs text-subtle">{t.key}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              {due && <span className={cn('shrink-0 text-xs', due.overdue ? 'font-medium text-danger' : 'text-subtle')}>{due.text}</span>}
              <PriorityIcon priority={t.priority} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const user = useUser();
  const { org } = useOrg();
  const { data, isPending } = useAnalytics();

  return (
    <Page>
      <PageHeader title={`Welcome back, ${user.name.split(' ')[0]}`} description={`Here’s what’s happening in ${org.name}.`} />
      {isPending || !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Open tasks" value={data.totals.openTasks} icon={<ListTodo />} />
            <StatTile label="Completed, last 7 days" value={data.totals.completedThisWeek} icon={<CheckCircle2 />} />
            <StatTile label="Overdue" value={data.totals.overdue} icon={<AlertTriangle />} alert />
            <StatTile label="Active projects" value={data.totals.projects} icon={<FolderKanban />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Throughput" subtitle="Tasks created vs completed per day, last 14 days (UTC)" className="lg:col-span-3">
              <ThroughputChart data={data.throughput} />
            </Panel>
            <Panel title="My open tasks" className="lg:col-span-2">
              <MyTasks />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Tasks by status">
              <BarList
                empty="No tasks yet."
                rows={data.byStatus.map((s) => ({
                  key: s.status,
                  value: s.count,
                  label: (
                    <>
                      <StatusIcon status={s.status} /> {STATUS_LABELS[s.status]}
                    </>
                  ),
                }))}
              />
            </Panel>
            <Panel title="Open tasks by priority">
              <BarList
                empty="No open tasks."
                rows={[...data.byPriority].reverse().map((p) => ({
                  key: p.priority,
                  value: p.count,
                  label: (
                    <>
                      <PriorityIcon priority={p.priority} /> {PRIORITY_LABELS[p.priority]}
                    </>
                  ),
                }))}
              />
            </Panel>
            <Panel title="Open tasks by assignee">
              <BarList
                empty="No open tasks."
                rows={data.byAssignee
                  .filter((a) => a.open > 0)
                  .sort((a, b) => b.open - a.open)
                  .slice(0, 6)
                  .map((a) => ({ key: a.userId ?? 'none', value: a.open, label: a.name }))}
              />
            </Panel>
          </div>
        </div>
      )}
    </Page>
  );
}
