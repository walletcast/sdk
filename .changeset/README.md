# Changesets

This folder is managed by [@changesets/cli](https://github.com/changesets/changesets).

## Adding a changeset

Run `pnpm changeset` in the repo root to create a new changeset. You'll be prompted to select which packages changed, the semver bump type (patch/minor/major), and a description.

The changeset file is committed with your PR. When the "Version Packages" PR is merged, all accumulated changesets are consumed and packages are published to npm.
