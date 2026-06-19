import type { ReactNode } from 'react';

export function DepositDetailSection({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-apg-silver">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
