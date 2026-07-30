import { AdjustmentsList } from '@/src/hair/components/inventory/AdjustmentsUi';
import { listAdjustments } from '@/src/hair/services/purchases';

export default async function AdjustmentsPage() {
  const adjustments = await listAdjustments();
  return <AdjustmentsList adjustments={adjustments} />;
}
