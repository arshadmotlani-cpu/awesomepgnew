import { SystemMapExplorer } from '@/src/hair/system-map/SystemMapExplorer';
import { getGraphStats, loadSystemMapGraph } from '@/src/hair/system-map/loadGraph';

export const metadata = {
  title: 'Salon Software System Map',
  robots: { index: false, follow: false },
};

export default function FyhairSystemMapPage() {
  const graph = loadSystemMapGraph();
  const stats = getGraphStats(graph);

  return (
    <>
      <div className="sr-only" aria-hidden>
        Salon Software architecture map — {stats.nodes} nodes, {stats.edges} edges
      </div>
      <SystemMapExplorer graph={graph} />
    </>
  );
}
