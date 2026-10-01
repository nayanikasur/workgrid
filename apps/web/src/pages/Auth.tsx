import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, registerSchema } from '@workgrid/shared';
import { Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Input, Logo } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { handleFormError } from '@/lib/utils';

export const DEMO_ACCOUNT = { email: 'demo@workgrid.dev', password: 'demo1234' };

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo className="text-lg" />
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-7 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{subtitle}</p>
        {children}
      </div>
      {footer && <p className="mt-5 text-sm text-muted">{footer}</p>}
    </div>
  );
}

const linkClass = 'font-medium text-brand-fg hover:underline';

// Redirects after sign-in are handled by <GuestOnly>, which honours ?next=.

export function LoginPage() {
  const { login } = useAuth();
  const { search } = useLocation();
  const [demoLoading, setDemoLoading] = useState(false);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values);
    } catch (err) {
      handleFormError(err, form.setError);
    }
  });

  const tryDemo = async () => {
    setDemoLoading(true);
    try {
      await login(DEMO_ACCOUNT);
    } catch (err) {
      toast.error(errorMessage(err), { description: 'Is the demo data seeded? Run `pnpm seed`.' });
      setDemoLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={
        <>
          New to WorkGrid?{' '}
          <Link to={`/register${search}`} className={linkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" autoFocus error={errors.email?.message} {...form.register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...form.register('password')} />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="secondary" className="w-full" onClick={tryDemo} loading={demoLoading}>
        {!demoLoading && <Sparkles className="size-4" />} Explore the live demo
      </Button>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const { search } = useLocation();
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signUp(values);
    } catch (err) {
      handleFormError(err, form.setError);
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever for small teams."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${search}`} className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label="Full name" autoComplete="name" autoFocus error={errors.name?.message} {...form.register('name')} />
        <Input label="Work email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters" error={errors.password?.message} {...form.register('password')} />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
