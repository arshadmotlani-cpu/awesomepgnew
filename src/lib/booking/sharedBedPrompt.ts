/**
 * First-visit prompt for a shared bed URL.
 * Selection only names the bed for the existing booking panel.
 * It does not create a booking or quote a price.
 */

export type SharedBedAvailability =
  | 'bookable'
  | 'occupied'
  | 'maintenance'
  | 'archived'
  | 'unavailable';

export type SharedBedCandidate = {
  bedId: string;
  bedCode: string;
  status: 'available' | 'maintenance' | 'blocked';
  bookable: boolean;
  occupied: boolean;
};

export type SharedBedPromptState =
  | { phase: 'hidden' }
  | {
      phase: 'open';
      bedId: string | null;
      bedCode: string | null;
      roomLabel: string;
      availability: SharedBedAvailability;
      canSelect: boolean;
    };

export function resolveSharedBedPrompt(input: {
  sharedBedId: string | null | undefined;
  dismissed: boolean;
  roomLabel: string;
  beds: SharedBedCandidate[];
}): SharedBedPromptState {
  const id = input.sharedBedId?.trim() || null;
  if (!id || input.dismissed) return { phase: 'hidden' };

  const bed = input.beds.find((row) => row.bedId === id);
  if (!bed) {
    return {
      phase: 'open',
      bedId: id,
      bedCode: null,
      roomLabel: input.roomLabel,
      availability: 'archived',
      canSelect: false,
    };
  }

  let availability: SharedBedAvailability = 'unavailable';
  if (bed.status === 'maintenance') {
    availability = 'maintenance';
  } else if (bed.bookable) {
    availability = 'bookable';
  } else if (bed.occupied) {
    availability = 'occupied';
  }

  return {
    phase: 'open',
    bedId: bed.bedId,
    bedCode: bed.bedCode,
    roomLabel: input.roomLabel,
    availability,
    canSelect: availability === 'bookable' && bed.bookable,
  };
}

/** Returns the bed to open in the existing panel, or null when booking is blocked. */
export function applySharedBedSelection(
  state: SharedBedPromptState,
): { bedId: string } | null {
  if (state.phase !== 'open' || !state.canSelect || !state.bedId) return null;
  return { bedId: state.bedId };
}

export function sharedBedPromptCopy(state: SharedBedPromptState): {
  title: string;
  detail: string;
} {
  if (state.phase !== 'open') {
    return { title: '', detail: '' };
  }
  if (state.availability === 'bookable') {
    return {
      title: 'Select your bed',
      detail: 'This link was shared for this bed.',
    };
  }
  if (state.availability === 'occupied') {
    return {
      title: 'This bed is unavailable',
      detail: 'This bed is occupied and cannot be booked.',
    };
  }
  if (state.availability === 'maintenance') {
    return {
      title: 'This bed is unavailable',
      detail: 'This bed is under maintenance and cannot be booked.',
    };
  }
  if (state.availability === 'archived') {
    return {
      title: 'This bed is unavailable',
      detail: 'This shared bed is no longer available.',
    };
  }
  return {
    title: 'This bed is unavailable',
    detail: 'This bed cannot be booked right now.',
  };
}
