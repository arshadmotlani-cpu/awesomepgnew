import { FyhMark } from '@/src/components/brand/fyh/FyhMark';
import { FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

export function FyhLoginBrandHeader() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-fyh-accent/40 bg-fyh-forest/25 shadow-lg shadow-black/30">
        <FyhMark size={56} />
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-fyh-accent">{FYH_ERP.productLine}</p>
      <h1 className="fyh-display mt-2 text-3xl font-semibold tracking-tight text-fyh-text sm:text-4xl">
        {FYH_ERP.name}
      </h1>
    </div>
  );
}
