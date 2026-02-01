import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StepCardProps {
  stepNumber: number;
  title: string;
  description?: string;
  isLast?: boolean;
  children: React.ReactNode;
}

export function StepCard({ stepNumber, title, description, isLast = false, children }: StepCardProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {stepNumber}
        </div>
        {!isLast && <div className="mt-2 h-full w-px bg-border" />}
      </div>
      <Card className="mb-6 flex-1">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
