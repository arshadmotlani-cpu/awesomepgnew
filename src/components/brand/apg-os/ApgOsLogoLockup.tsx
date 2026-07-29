import { ApgOsMark, apgOsMarkVariantToProps, type ApgOsMarkVariant } from '@/src/components/brand/apg-os/ApgOsMark';
import { ApgOsWordmark } from '@/src/components/brand/apg-os/ApgOsWordmark';

type ApgOsLogoLockupProps = {
  markSize?: number;
  variant?: ApgOsMarkVariant;
  showTagline?: boolean;
  className?: string;
  layout?: 'horizontal' | 'stacked';
};

export function ApgOsLogoLockup({
  markSize = 40,
  variant = 'on-dark',
  showTagline = false,
  className,
  layout = 'horizontal',
}: ApgOsLogoLockupProps) {
  const { style, surface } = apgOsMarkVariantToProps(variant);
  const wordmarkSurface = surface === 'transparent' ? 'dark' : surface;

  if (layout === 'stacked') {
    return (
      <div className={['flex flex-col items-center text-center', className].filter(Boolean).join(' ')}>
        <ApgOsMark size={markSize} style={style} surface={surface} className="mb-4 shrink-0" />
        <ApgOsWordmark
          surface={wordmarkSurface === 'light' ? 'light' : 'dark'}
          size="lg"
          showTagline={showTagline}
        />
      </div>
    );
  }

  return (
    <div className={['flex min-w-0 items-center gap-3', className].filter(Boolean).join(' ')}>
      <ApgOsMark size={markSize} style={style} surface={surface} className="shrink-0" />
      <ApgOsWordmark
        surface={wordmarkSurface === 'light' ? 'light' : 'dark'}
        size="md"
        showTagline={showTagline}
      />
    </div>
  );
}

export function ApgOsSidebarIcon({
  size = 36,
  variant = 'on-dark',
  className,
}: {
  size?: number;
  variant?: ApgOsMarkVariant;
  className?: string;
}) {
  const { style, surface } = apgOsMarkVariantToProps(variant);
  return (
    <ApgOsMark
      size={size}
      style={style}
      surface={surface}
      className={className}
      title="APG OS Admin Panel"
    />
  );
}
