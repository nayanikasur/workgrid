import type { AnalyticsDTO, MemberDTO, ProjectDTO, TaskDTO, UsageDTO } from '@workgrid/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { keys, useOrg } from './org';

export function useProjects() {
  const { org, base } = useOrg();
  return useQuery({
    queryKey: keys.projects(org.slug),
    queryFn: async () => (await api.get<{ projects: ProjectDTO[] }>(`${base}/projects`)).projects,
  });
}

export function useMembers() {
  const { org, base } = useOrg();
  return useQuery({
    queryKey: keys.members(org.slug),
    queryFn: async () => (await api.get<{ members: MemberDTO[] }>(`${base}/members`)).members,
  });
}

export function useTasks(projectId: string) {
  const { org, base } = useOrg();
  return useQuery({
    queryKey: keys.tasks(org.slug, projectId),
    queryFn: async () => (await api.get<{ tasks: TaskDTO[] }>(`${base}/projects/${projectId}/tasks`)).tasks,
  });
}

export function useMyTasks() {
  const { org, base } = useOrg();
  return useQuery({
    queryKey: keys.myTasks(org.slug),
    queryFn: async () => (await api.get<{ tasks: TaskDTO[] }>(`${base}/my-tasks`)).tasks,
  });
}

export function useAnalytics() {
  const { org, base } = useOrg();
  return useQuery({
    queryKey: keys.analytics(org.slug),
    queryFn: async () => (await api.get<{ analytics: AnalyticsDTO }>(`${base}/analytics`)).analytics,
  });
}

export function useUsage() {
  const { org, base } = useOrg();
  return useQuery({
    queryKey: keys.usage(org.slug),
    queryFn: async () => (await api.get<{ usage: UsageDTO }>(`${base}/billing/usage`)).usage,
  });
}
