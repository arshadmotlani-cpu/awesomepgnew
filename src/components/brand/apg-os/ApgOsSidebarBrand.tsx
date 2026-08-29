import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';

type ApgOsSidebarBrandProps = {
  collapsed?: boolean;
  className?: string;
};

/** Sidebar header — mark only (expanded or collapsed). */
export function ApgOsSidebarBrand({ collapsed = false, className }: ApgOsSidebarBrandProps) {
  if (collapsed) {
    return (
      <div
        className={['flex h-14 items-center justify-center', className].filter(Boolean).join(' ')}
      >
        <ApgOsMark size={32} style="filled" surface="dark" title="PG" />
      </div>
    );
  }

  return (
    <div
      className={['flex min-h-[4.5rem] items-center px-5 py-4', className].filter(Boolean).join(' ')}
    >
      <ApgOsMark size={36} style="filled" surface="dark" className="shrink-0" title="PG" />
    </div>
  );
}
