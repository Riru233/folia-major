// shared/realecoReleaseMetadata.cjs
// Validates the three version sources that authorize a Realeco release.
//
// A version is A.B.C, or A.B.C.D for a service pack on the same A.B.C (0.7.29.1 follows 0.7.29).
// Both shapes are plain digits separated by dots: no prerelease tag, no channel letter. The three
// sources must agree exactly, so the commit that authorizes the release names the version the
// tag, the release file and package.json all carry.

/** A.B.C or A.B.C.D, digits only. */
const VERSION_SOURCE = String.raw`[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?`;
const RELEASE_VERSION_PATTERN = new RegExp(`^${VERSION_SOURCE}$`);
const RELEASE_FILE_PATTERN = new RegExp(`^${VERSION_SOURCE}\r?\n?$`);
const COMMIT_PATTERN = new RegExp(`^release: v(${VERSION_SOURCE})$`);

function validateRealecoReleaseMetadata({ commitMessage, releaseFileContent, packageVersion }) {
  if (!RELEASE_FILE_PATTERN.test(releaseFileContent)) {
    throw new Error('realeco-release must contain exactly one A.B.C or A.B.C.D version line.');
  }

  const commitMatch = COMMIT_PATTERN.exec(commitMessage);
  if (!commitMatch) {
    throw new Error('Current complete commit message must exactly match release: vA.B.C.');
  }

  const releaseFileVersion = releaseFileContent.trim();
  const commitVersion = commitMatch[1];
  if (!RELEASE_VERSION_PATTERN.test(packageVersion)) {
    throw new Error('package.json version must be a plain A.B.C or A.B.C.D version.');
  }
  if (commitVersion !== releaseFileVersion || packageVersion !== releaseFileVersion) {
    throw new Error(`Release versions must match: commit=${commitVersion}, realeco-release=${releaseFileVersion}, package.json=${packageVersion}.`);
  }

  return releaseFileVersion;
}

/**
 * Splits a version into its numeric parts for comparison, so 0.7.29 < 0.7.29.1 < 0.7.30.
 * Throws when a version is missing a part, since a release could not be ordered against it.
 */
function parseReleaseVersion(version) {
  if (!RELEASE_VERSION_PATTERN.test(version || '')) {
    throw new Error(`Not a release version: ${version}`);
  }
  return version.split('.').map(Number);
}

/**
 * Orders two versions part by part; a version with fewer parts sorts before one that carries an
 * extra non-zero part (0.7.29 < 0.7.29.1), which is what makes a service pack newer than its base.
 */
function compareReleaseVersions(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}

module.exports = {
  validateRealecoReleaseMetadata,
  parseReleaseVersion,
  compareReleaseVersions,
};
