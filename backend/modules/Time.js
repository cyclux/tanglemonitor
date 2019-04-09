/*eslint no-console: ["error", { allow: ["log", "error"] }] */

module.exports = {
  /* Adding timestamps to log output */
  Stamp: () => {
    let now = new Date();
    now.setHours(now.getHours() + 1);
    return '[' + now.toISOString() + '] ';
  }
};
