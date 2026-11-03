// Commit messages follow Conventional Commits (CONTRIBUTING.md), checked by the commit-msg hook and by CI.
// Headers up to 120 characters (the project's messages name the OPS cards they close); a subject may start
// with a capital (names: Notion, Stripe, Treasury, CSV…).
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 120],
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
