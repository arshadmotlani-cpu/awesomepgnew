function isElementLike(target: EventTarget | null): target is Element {
  return Boolean(target && typeof (target as Element).closest === 'function');
}

/** True when Enter in this target should not submit the Add Employee form. */
export function shouldBlockEmployeeFormEnter(target: EventTarget | null): boolean {
  if (!isElementLike(target)) return true;
  if (target.closest('[data-create-employee="1"]')) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA') return false;
  if (tag === 'BUTTON' || tag === 'A') return false;
  return true;
}

/** Only the explicit Create employee control may POST the form. */
export function shouldAllowEmployeeFormSubmit(submitter: EventTarget | null): boolean {
  if (!isElementLike(submitter)) return false;
  return submitter.getAttribute('data-create-employee') === '1';
}
