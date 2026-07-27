import { HairMobileNav } from '@/src/hair/components/HairMobileNav';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { HairTopBar } from '@/src/hair/components/HairTopBar';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';

export default async function HairAppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireHairAuthPage();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <HairMobileNav />
      <HairSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <HairTopBar admin={admin} />
        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
