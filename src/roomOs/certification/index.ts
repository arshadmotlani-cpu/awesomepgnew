export type {
  CertificationCheckContext,
  CertificationDomain,
  CertificationError,
  CertificationErrorCode,
  CertificationFinding,
  CertificationOverallStatus,
  CertificationReport,
  CertificationScope,
  CertificationSeverity,
} from '@/src/roomOs/certification/types';
export { CERTIFICATION_CONTRACT_VERSION } from '@/src/roomOs/certification/types';
export {
  CERTIFICATION_CHECKS_V1,
  CERTIFICATION_SUITE_SHANTINAGAR_V1,
  SHANTINAGAR_RESIDENT_PARITY_TARGET,
} from '@/src/roomOs/certification/catalog/v1';
export {
  aggregateCertificationStatus,
  buildCertificationReport,
  failFinding,
  passFinding,
  warnFinding,
} from '@/src/roomOs/certification/buildReport';
export {
  runCertification,
  runShantinagarCertification,
} from '@/src/roomOs/certification/runCertification';
export type { RunCertificationResult } from '@/src/roomOs/certification/runCertification';
export { resolveShantinagarPgId } from '@/src/roomOs/certification/shantinagar/resolvePg';
export { runShantinagarParity } from '@/src/roomOs/certification/shantinagar/runShantinagarParity';
export type { RunShantinagarParityResult } from '@/src/roomOs/certification/shantinagar/runShantinagarParity';
export {
  certificationBlocksRelease,
  formatCertificationFindingLine,
  formatCertificationReportTable,
} from '@/src/roomOs/certification/formatReport';
