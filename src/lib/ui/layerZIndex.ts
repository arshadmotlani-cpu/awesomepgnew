/** Shared stacking order — nested modals must sit above MobileBottomSheet (99999). */
export const LAYER_Z = {
  bottomSheetOverlay: 99_990,
  bottomSheetPanel: 99_999,
  /** Date picker / nested dialogs opened from inside a bottom sheet */
  nestedOverlay: 100_000,
  nestedDialog: 100_001,
} as const;
