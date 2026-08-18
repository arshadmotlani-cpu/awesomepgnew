import { FYH_APPEARANCE_BLOCKING_SCRIPT } from '@/src/hair/lib/appearance';

/** Applies stored theme/accent before React hydration to avoid flash. */
export function FyhAppearanceScript() {
  return (
    <script
      id="fyh-appearance-bootstrap"
      dangerouslySetInnerHTML={{ __html: FYH_APPEARANCE_BLOCKING_SCRIPT }}
    />
  );
}
