import type { AuditLogDTO } from '@workgrid/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
import { Activity as ActivityIcon, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, PageHeader, PageLoader } from '@/components/ui';
import { Page } from '@/layouts/AppLayout';
import { api } from '@/lib/api';
import { keys, useOrg } from '@/lib/org';
import { NotFoundPage } from './NotFound';

interface AuditPage {
  logs: AuditLogDTO[];
  nextCursor: string | null;
  retentionDays: number;
}

function dayHeading(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMM d');
}

export function ActivityPage() {
  const { org, base, can } = useOrg();
  const allowed = can('audit:read');

  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: keys.audit(org.slug),
    queryFn: ({ pageParam }) => api.get<AuditPage>(`${base}/audit${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: allowed,
  });

  if (!allowed) return <NotFoundPage title="Admins only" description="The audit log is visible to workspace owners and admins." />;

  const logs = data?.pages.flatMap((p) => p.logs) ?? [];
  const retention = data?.pages[0]?.retentionDays;
  // Logs arrive newest first, so grouping in order keeps days sorted.
  const days = new Map<string, AuditLogDTO[]>();
  for (const log of logs) {
    const day = dayHeading(log.createdAt);
    days.set(day, [...(days.get(day) ?? []), log]);
  }

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Activity"
        description={
          retention ? `An audit trail of the last ${retention} days.${org.plan === 'free' ? ' Upgrade to Pro for 90 days of history.' : ''}` : undefined
        }
        actions={
          org.plan === 'free' &&
          can('billing:manage') && (
            <Link to={`/${org.slug}/settings/billing`}>
              <Button variant="secondary">Upgrade</Button>
            </Link>
          )
        }
      />
      {isPending ? (
        <PageLoader />
      ) : logs.length === 0 ? (
        <EmptyState icon={<ActivityIcon className="size-5" />} title="No activity yet" description="Changes to projects, tasks and members will show up here." />
      ) : (
        <div className="space-y-6">
          {[...days].map(([day, entries]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">{day}</h2>
              <Card>
                <ul className="divide-y divide-line">
                  {entries.map((log) => (
                    <li key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                      {log.actor ? (
                        <Avatar name={log.actor.name} color={log.actor.avatarColor} />
                      ) : (
                        <span className="flex size-6 items-center justify-center rounded-full bg-hover text-subtle">
                          <Bot className="size-3.5" />
                        </span>
                      )}
                      <p className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{log.actor?.name ?? 'System'}</span> <span className="text-muted">{log.summary}</span>
                      </p>
                      <time dateTime={log.createdAt} className="shrink-0 text-xs text-subtle tabular-nums">
                        {format(new Date(log.createdAt), 'HH:mm')}
                      </time>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void fetchNextPage()} loading={isFetchingNextPage}>
                Load older activity
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
