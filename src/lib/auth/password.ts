const MIN_ADMIN_PASSWORD_LENGTH = 12;

export function validateAdminPassword(password: string): string | null {
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

const MIN_CUSTOMER_PASSWORD_LENGTH = 8;

export function validateCustomerPassword(password: string): string | null {
  if (!password || password.length < MIN_CUSTOMER_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_CUSTOMER_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
