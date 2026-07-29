import { HairAppHeader } from '@/src/hair/components/HairAppHeader';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';

export default async function HairAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireHairAuthPage();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <HairSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <HairAppHeader admin={admin} />
        <main className="relative z-0 flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
