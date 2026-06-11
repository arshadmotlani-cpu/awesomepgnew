export type MascotPose = 'welcome' | 'warning' | 'success';

export const MASCOT_IMAGES: Record<MascotPose, string> = {
  welcome: '/assets/cockroach-wave.png',
  warning: '/assets/cockroach-alert.png',
  success: '/assets/cockroach-happy.png',
};

/** Pick pose from guide state and current page. */
export function mascotPoseFor(args: {
  message: string;
  pathname: string;
  introMessage: string;
  idleMessage: string;
}): MascotPose {
  const { message, pathname, introMessage, idleMessage } = args;

  if (
    pathname.includes('payment-success') ||
    pathname.includes('/account/resident') && message.toLowerCase().includes('checked in')
  ) {
    return 'success';
  }

  if (message === introMessage || message === idleMessage) {
    return 'welcome';
  }

  return 'warning';
}
