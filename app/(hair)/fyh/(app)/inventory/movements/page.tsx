import { MovementsList } from '@/src/hair/components/inventory/MovementsUi';
import { listMovements } from '@/src/hair/services/stock';

export default async function MovementsPage() {
  const movements = await listMovements({ limit: 300 });
  return <MovementsList movements={movements} />;
}
