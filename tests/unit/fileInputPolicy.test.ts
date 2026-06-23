import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildImageFileInputProps,
  findCaptureAttributeViolations,
  findRawFileInputViolations,
  IMAGE_UPLOAD_ACCEPT,
  scanSourcesForCaptureViolations,
  scanSourcesForRawFileInputViolations,
} from '../../src/lib/uploads/fileInputPolicy';
import { collectUploadPolicySources } from '../../src/lib/uploads/scanUploadSources';

describe('buildImageFileInputProps', () => {
  it('never includes capture', () => {
    const props = buildImageFileInputProps();
    assert.equal(props.type, 'file');
    assert.equal(props.accept, IMAGE_UPLOAD_ACCEPT);
    assert.equal('capture' in props, false);
  });

  it('accepts gallery-friendly image types including HEIC', () => {
    assert.match(IMAGE_UPLOAD_ACCEPT, /image\/\*/);
    assert.match(IMAGE_UPLOAD_ACCEPT, /\.heic/);
  });
});

describe('findCaptureAttributeViolations', () => {
  it('flags capture="environment" on file inputs', () => {
    const bad = '<input type="file" accept="image/*" capture="environment" />';
    const hits = findCaptureAttributeViolations('Form.tsx', bad);
    assert.ok(hits.length >= 1);
  });

  it('ignores capture mentioned only in comments', () => {
    const ok = '// NEVER set capture on file inputs';
    assert.deepEqual(findCaptureAttributeViolations('policy.ts', ok), []);
  });
});

describe('findRawFileInputViolations', () => {
  it('flags literal file inputs outside the shared component', () => {
    const bad = '<input type="file" accept="image/*" className="hidden" />';
    const hits = findRawFileInputViolations('LegacyForm.tsx', bad);
    assert.equal(hits.length, 1);
  });

  it('allows spread-based pickers in shared component pattern', () => {
    const ok = '<input {...safeProps} id={id} onChange={handleChange} />';
    assert.deepEqual(findRawFileInputViolations('ImageFileInput.tsx', ok), []);
  });
});

describe('repo upload policy regression guard', () => {
  it('has no capture= attributes in app or src', () => {
    const sources = collectUploadPolicySources();
    const violations = scanSourcesForCaptureViolations(sources);
    assert.deepEqual(
      violations,
      [],
      violations.length ? `Forbidden capture attributes:\n${violations.join('\n')}` : undefined,
    );
  });

  it('has no raw <input type="file"> outside ImageFileInput', () => {
    const sources = collectUploadPolicySources();
    const violations = scanSourcesForRawFileInputViolations(sources);
    assert.deepEqual(
      violations,
      [],
      violations.length ? `Raw file inputs found:\n${violations.join('\n')}` : undefined,
    );
  });

  it('shared ImageFileInput uses buildImageFileInputProps', () => {
    const shared = sourcesByPath(collectUploadPolicySources(), 'src/components/shared/ImageFileInput.tsx');
    assert.match(shared, /buildImageFileInputProps/);
    assert.doesNotMatch(shared, /capture\s*=/);
  });
});

function sourcesByPath(
  entries: Array<{ path: string; source: string }>,
  path: string,
): string {
  return entries.find((e) => e.path === path)?.source ?? '';
}
