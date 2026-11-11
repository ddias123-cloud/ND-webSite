# N&D publication and GitHub source mirror

The user explicitly selected one-way synchronization: changes made in this chat
are published to the private Site and then copied to `ddias123-cloud/ND-webSite`.
Apply this workflow to subsequent edits of this project. There is no background
filesystem watcher and GitHub edits do not automatically publish the private Site.

1. Follow the Sites skill to open, build, test and publish the selected existing
   Site. Preserve its owner-only access and the existing authentication system.
2. After the publication succeeds, export its exact pushed source commit with
   `node scripts/github-snapshot.mjs --commit <FULL_SHA> --output <ABSOLUTE_PATH>`.
   Put the JSON outside the checkout. It contains source code, never database
   records. Do not mirror the working directory, `.preview`, `.env`, credentials,
   generated bundles, deployment archives or user account data.
3. Use the connected GitHub tools to read the current `main` head and tree.
   Upload binary entries as base64 Git blobs and create a fresh tree containing
   all exported files at their relative paths. Text entries can use inline
   `content` in `create_tree`. Replace only the root `source` tree with this new
   tree, preserving all unrelated root paths and the existing redirect index.
   Missing files in the new source snapshot are deliberately removed from the
   source subtree only; never delete unrelated repository files.
4. Add/update root `source-sync.json` with the exported source commit, directory
   and verified private Site URL. Keep root `_config.yml` excluding `source` and
   `source-sync.json` from GitHub Pages, so Pages only serves the login redirect.
   This is a publishing exclusion, not code privacy: the GitHub repo is public.
5. Make a commit parented to the inspected GitHub head. Update `main` without
   force, using its previous head as `expected_sha`. If another writer moves the
   branch, re-read before updating; do not overwrite concurrent changes.
6. Verify the new source tree and metadata, plus the Pages workflow when changed.
   Report the source link. Do not claim background automatic deployment or
   synchronization unless an actual supported integration has been installed.

For documentation/workflow-only changes, mirror the committed source and keep
the current deployment when the runtime assets are unchanged. Never put Sites
or GitHub access tokens in scripts, Git configuration, Actions secrets or files.
