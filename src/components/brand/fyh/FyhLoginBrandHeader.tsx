import { FyhMark } from '@/src/components/brand/fyh/FyhMark';
import { FYH_ERP } from '@/src/lib/brand/fyhBrandTokens';

export function FyhLoginBrandHeader() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-5 flex justify-center">
        <FyhMark size={48} className="max-w-full" title="SOFT" />
      </div>
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-fyh-accent">{FYH_ERP.productLine}</p>
      <h1 className="fyh-display mt-2 text-3xl font-semibold tracking-tight text-fyh-text sm:text-4xl">
        {FYH_ERP.name}
      </h1>
    </div>
  );
}
