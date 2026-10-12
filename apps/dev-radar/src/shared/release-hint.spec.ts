import { releaseHint } from './release-hint';

describe('releaseHint', () => {
  it('recognises documented release labels', () => {
    expect(releaseHint(['autorelease: pending'], 'x')).toContain(
      'autorelease: pending',
    );
    expect(releaseHint(['Release'], 'x')).toContain('Release');
  });

  it('recognises release-tool branch prefixes', () => {
    expect(releaseHint([], 'release-please--branches--main')).toContain(
      'release-please--',
    );
    expect(releaseHint([], 'changeset-release/main')).toContain(
      'changeset-release/',
    );
  });

  it('does NOT infer a release from ambiguous names', () => {
    expect(releaseHint([], 'feature/prepare-release')).toBeNull();
    expect(
      releaseHint(['bug', 'documentation'], 'fix-releases-page'),
    ).toBeNull();
    expect(releaseHint([], 'main')).toBeNull();
  });
});
