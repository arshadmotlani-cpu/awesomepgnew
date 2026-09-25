import {
  applyUiImplications,
  isFyhStaffRightKey,
  type FyhStaffRightKey,
} from '@/src/workforce/permissions/fyhStaffRightsModel';

/** Parse Staff Rights editor form values into authoritative grant keys. */
export function parseStaffRightsFromForm(formData: FormData, field = 'permissions'): FyhStaffRightKey[] {
  const raw = formData.getAll(field).map(String);
  const selected = new Set<FyhStaffRightKey>();
  for (const key of raw) {
    if (isFyhStaffRightKey(key)) selected.add(key);
  }
  return [...applyUiImplications(selected)];
}
