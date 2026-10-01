import { zodResolver } from '@hookform/resolvers/zod';
import { createOrgSchema, type OrgDTO } from '@workgrid/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { handleFormError, slugify } from '@/lib/utils';
import { AuthShell } from './Auth';

export function OnboardingPage() {
  const { orgs, reloadOrgs, logout } = useAuth();
  const navigate = useNavigate();
  const form = useForm({ resolver: zodResolver(createOrgSchema), defaultValues: { name: '', slug: '' } });
  const { errors, isSubmitting, dirtyFields } = form.formState;
  const slug = form.watch('slug');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { org } = await api.post<{ org: OrgDTO }>('/orgs', values);
      await reloadOrgs();
      navigate(`/${org.slug}`);
    } catch (err) {
      handleFormError(err, form.setError);
    }
  });

  return (
    <AuthShell
      title="Create a workspace"
      subtitle="A workspace is your team's home: projects, members and billing live inside it."
      footer={
        orgs.length > 0 ? (
          <Link to="/" className="font-medium text-brand-fg hover:underline">
            Back to my workspaces
          </Link>
        ) : (
          <button type="button" onClick={() => void logout()} className="font-medium text-brand-fg hover:underline">
            Sign out
          </button>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Workspace name"
          placeholder="Acme Inc"
          autoFocus
          error={errors.name?.message}
          {...form.register('name', {
            // Keep suggesting a URL until the user edits it themselves.
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              if (!dirtyFields.slug) form.setValue('slug', slugify(e.target.value));
            },
          })}
        />
        <Input
          label="Workspace URL"
          placeholder="acme"
          error={errors.slug?.message}
          hint={`${window.location.host}/${slug || 'your-team'}`}
          {...form.register('slug')}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create workspace
        </Button>
      </form>
    </AuthShell>
  );
}
