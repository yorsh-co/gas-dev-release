// @ts-check

/** An expected failure; its message is shown to the user without a stack trace. */
export class ReleaseError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'ReleaseError';
  }
}
