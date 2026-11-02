# Agent Guide

Start here for repository orientation and common edit routing:

- `docs/repo-navigation.md`

Before making structural changes, verify affected paths and commands against that document and the current `package.json`/`src/routes/index.ts` wiring.

## Dependencies

- Bun only: `package.json` sets `packageManager` and `devEngines`, so npm refuses to install or run scripts here. Use `bun install`, `bun run <script>` and `bun add <pkg>`.
- CI and Docker install with `bun install --frozen-lockfile`. Commit `bun.lock` with every dependency change.
- `bunfig.toml` lets `bun add` and `bun update` pick only versions published at least 5 days ago (`minimumReleaseAge = 432000`, in seconds) and saves exact versions. `.npmrc` sets `min-release-age=5` (in days) for any npm still in use.
- Never download a tool on the fly (`npx <pkg>`, `bunx <pkg>`, `<pkg>@latest`): add it as a pinned devDependency and run `bunx --no-install <bin>`.
- No Dependabot or Renovate: update dependencies by hand and review the `bun.lock` diff.

## Releasing

A release is a published GitHub release whose tag `v<major>.<minor>.<patch>` points at a `main` commit. Nothing is committed by hand first: the workflows bump the version and build the image after the release exists.

- Pick the version from what `main` carries since the last tag (`git tag --sort=-v:refname | head -1`, then `git log v<previous>..origin/main`). Patch for fixes and for SQL changes that return the same rows, such as performance or ordering. Minor for a new route, parameter or response field, a behaviour change, or a new `dbs-config.yaml` key.
- Release only a green `main` commit: its `Test` and `Docker Develop` runs passed (`gh run list --branch main`). The release workflow doesn't check.
- Publish with `gh`, targeting the full commit SHA: `gh release create v<x.y.z> --repo pinax-network/pinax-api --target <full sha> --title v<x.y.z> --notes-file notes.md`. An abbreviated SHA is rejected (`Release.target_commitish is invalid`), and the release creates the tag, so don't push one.
- Write the notes for operators and API users in the form of the previous releases (`gh release view v<previous>`): a lead paragraph naming the kind of release and whether parameters, response fields, schemas or configuration changed; `> [!WARNING]` for a behaviour change and `> [!NOTE]` for a new configuration key; one section per change with its PR link, what was wrong, what changed and how it was measured; a "Deploying" section when the operator has to do something. `CHANGELOG.md` is no longer maintained (its last entry is 3.10.0); the release notes are the changelog.
- Then verify the automation: `Release` commits `chore: version v<x.y.z> [skip ci]` to `main`, and `Docker Release` builds that commit and pushes `ghcr.io/pinax-network/pinax-api:v<x.y.z>` and `:latest`, about 5 minutes in all (`gh run list --workflow Release` and `--workflow "Docker Release"`; `package.json` on `main` must carry the version). A pre-release, or a tag with a suffix such as `-rc1`, skips both. Deploying the image to a cluster is not part of this repository.
