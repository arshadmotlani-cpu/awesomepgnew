import { InventoryNav } from '@/src/hair/components/inventory/InventoryNav';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <InventoryNav />
      {children}
    </div>
  );
}
