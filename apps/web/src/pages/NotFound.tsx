import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';

interface Props {
  title?: string;
  description?: string;
  onBack?: () => void;
}

export function NotFoundPage({ title = 'Page not found', description = 'That link doesn’t lead anywhere.', onBack }: Props) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-full max-w-md items-center px-4 py-16">
      <div className="w-full">
        <EmptyState
          icon={<Compass className="size-5" />}
          title={title}
          description={description}
          action={<Button onClick={onBack ?? (() => navigate('/'))}>Take me home</Button>}
        />
      </div>
    </div>
  );
}
