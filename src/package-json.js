// @ts-check

/** Fields of the project's package.json that ship on the release branch. */
const KEEP_FIELDS = [
  'name',
  'version',
  'description',
  'license',
  'author',
  'repository',
  'homepage',
];

/**
 * Builds the trimmed package.json committed to a release branch.
 *
 * @param {Record<string, unknown>} pkg The project's package.json.
 * @returns {string} Formatted JSON with a trailing newline.
 */
export function releasePackageJson(pkg) {
  const trimmed = Object.fromEntries(
    KEEP_FIELDS.filter((field) => field in pkg).map((field) => [
      field,
      pkg[field],
    ]),
  );
  return `${JSON.stringify(trimmed, null, 2)}\n`;
}
