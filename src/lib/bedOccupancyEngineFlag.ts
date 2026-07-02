/** Phase 1 occupancy SSOT — enable with OCCUPANCY_ENGINE_V2=1 */
export function isOccupancyEngineV2Enabled(): boolean {
  const raw = process.env.OCCUPANCY_ENGINE_V2?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
