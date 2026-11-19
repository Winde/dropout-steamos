# Releasing

A release is a tag. Pushing a `vMAJOR.MINOR.PATCH` tag runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which
verifies the commit, runs the checks, builds the AppImage, writes the notes from
the commits since the previous release, and publishes a release named after the
tag. Nothing is typed in and nothing is created by hand.

The notes are the commits. A commit body is a section of the release, a commit
without one is a line under `Changes`, and commits that only ship the repository
(`release:`, `ci:`, `chore:`…) never appear. See
[Writing the notes](#writing-the-notes).

## Versioning

Semantic versioning, tagged `vMAJOR.MINOR.PATCH`.

| Bump | When |
|---|---|
| MAJOR | A stored format changes incompatibly, or the controls are reorganised in a way that breaks muscle memory |
| MINOR | A new user-facing capability |
| PATCH | Fixes only, no new behaviour |

Pre-releases use a suffix: `v0.2.0-beta.1`, `v0.2.0-rc.1`. A hyphenated tag is
published as a pre-release automatically, so a beta cannot become the "latest"
download or reach an app's update check.

## What a release contains

| Platform | Artifacts |
|---|---|
| Linux x64 | `Drop-In-<version>-x86_64.AppImage`, `install.sh`, `steam-art.zip` |
| all | `SHA256SUMS.txt` |

The AppImage is the runnable artifact. `install.sh` downloads it, verifies the
checksum, installs it under `~/Applications` and adds the Steam shortcut;
`steam-art.zip` holds the five library images and their licence notice. Both
use stable names, so `releases/latest/download/install.sh` always points at the
newest release; the script resolves the tag itself.

The AppImage is self-contained and runs on SteamOS and other glibc-based
distributions; FUSE 2 is its only system dependency (SteamOS has it, and
`--appimage-extract-and-run` works without it).

## Writing the notes

[`scripts/release-notes.mjs`](../scripts/release-notes.mjs) turns the commits
between the previous tag and this one into the release body.

- A commit with a body contributes that body verbatim, markdown and all. Start
  it with `##` to make a section, and use `-` for its points.
- A commit without a body contributes one line from its subject, with the
  `area:` prefix removed and the first letter capitalised.
- `release:`, `ci:`, `chore:`, `test:`, `build:`, `style:` and `deps:` commits
  are skipped, so the version bump and the workflow changes stay out of the
  notes.
- If nothing is left, the run fails rather than publishing an empty release.

A release that is one squashed commit reads exactly like that commit's body, and
a release of twenty commits reads like the bodies of those twenty. Preview the
body from committed but untagged work:

```sh
npm run notes -- v0.3.0          # compares with the tag before it
npm run notes -- v0.2.1 v0.3.0   # explicit range
```

## Cutting a release

1. Commit the work. The commit messages are the notes, so write what changed for
   a person using the app; for a release that is one squashed commit, put the
   notes in its body.
2. Bump `version` in `package.json` and commit it with the release. The run
   fails before building if the tag and the field disagree, and removes the
   tag: the artifact is named from `package.json`, and anyone building from the
   tag must get the version the tag claims.
3. Tag the commit and push the tag:

   ```sh
   git tag -a v0.3.0 -m "v0.3.0"
   git push origin main v0.3.0
   ```

4. Watch **Actions**, then **Release**. The run fails before building unless the
   tag is semver, on `main`, the only release tag on that commit, and agrees
   with `package.json`. It then runs `npm run verify`, builds the AppImage,
   creates the release as a draft, attaches the assets and `SHA256SUMS.txt`, and
   publishes it.

The release is created after the build passes and published last, so a failed
build leaves no release, and a release is never visible without its assets.

## Testing the process

`dry_run` on a manual run does everything except touch a release: it needs no
tag and no release, and it builds any commit as it stands. Use it to rehearse a
change before tagging.

A prerelease tag is the full rehearsal: it runs the same workflow end to end and
publishes, but as a pre-release, so `releases/latest` and the update check in
installed builds never see it.

1. Set `version` in `package.json` to the prerelease you are rehearsing, for
   example `0.3.0-rc.1`, and commit it with the notes for that build.
2. Optionally push the tag, to rehearse the tag checks too:

   ```sh
   git tag -a v0.3.0-rc.1 -m "v0.3.0-rc.1"
   git push origin v0.3.0-rc.1
   ```

3. Run **Actions**, then **Release**, with `dry_run` on, from the commit.
4. Download the `linux` artifact from the run.
5. Install and run the AppImage on a Steam Machine or Deck: sign in, play a
   video, use the controller. See [install-steamos.md](install-steamos.md).
6. If the build is not what you want, fix it and, if you tagged it, delete the
   tag and repeat:

   ```sh
   git tag -d v0.3.0-rc.1
   git push origin :refs/tags/v0.3.0-rc.1
   ```

7. To ship, tag the stable version and push the tag.

## Re-running

Re-run from the same tag (**Actions**, then **Release**, then **Re-run jobs**).
Uploads use `--clobber`, so artifacts are replaced rather than duplicated, and
an existing release keeps the notes it has, so an edit made in the UI survives.
To change the notes after amending a commit message, edit the release body; the
tag cannot be moved without deleting the release and the tag.

A tag rejected for a version mismatch is removed by the run. A build or test
failure leaves the tag in place, which is what a re-run needs; if you give up on
that version instead, delete its tag before tagging the next one, or the next
release will compare against it.

To abandon a release, delete it in the GitHub UI and delete the tag:

```sh
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0
```

## Distribution channels

**GitHub Releases** is the only channel. There is no store, no package
repository, and no CI job that publishes anywhere else.

**SteamOS** needs one Desktop Mode trip: download the AppImage, make it
executable, add it to Steam, then launch it from Game Mode. The AppImage lives
in `/home`, so it survives system updates.

Drop-In updates itself from GitHub Releases. The header's **Drop-In vX.Y.Z /
Check for updates** stamp, or **Y** outside the player, compares the running
`app.getVersion()` with the latest stable release; **Update now** downloads
`Drop-In-<version>-x86_64.AppImage`, verifies it against that release's
`SHA256SUMS.txt`, renames it over the running AppImage, and relaunches. This is
why every release must keep that asset name and publish `SHA256SUMS.txt`.
Builds from before the updater have to be replaced once with the installer.

The installer is the fallback: re-run it for a first install, a machine without
write access to the AppImage, or to repair one. It replaces
`~/Applications/Drop-In.AppImage` in place, so the Steam entry and its appid stay
valid, and it leaves the shortcut's name, controller layout and any artwork you
changed in Steam alone. Artwork it installed itself is refreshed on update. Use
`--force-art` to put the packaged set back.

**Other glibc distributions** run the same AppImage. FUSE 2 is the only system
dependency; where it is missing (some Ubuntu installs), `--appimage-extract-and-run`
works without it. Packagers can extract the AppImage with `--appimage-extract`
or build from the tag.

## Artwork

`packaging/steam-art/` holds the five library images and the scripts that
produce them from `build/icon.svg`. The icon is Iconoir's `sofa` (MIT), and the
art is that icon plus a flat gradient and typography; see
[its README](../packaging/steam-art/README.md). The release workflow zips the
five PNGs and `NOTICE.txt`; the generator scripts stay in the repository.

## Checklist

- [ ] commits written: a body says what changed, in the app's words
- [ ] `npm run notes` reads sensibly
- [ ] `package.json` version bumped and committed on `main`
- [ ] `npm run verify` passes
- [ ] `dry_run` workflow passed on the commit or a prerelease of it
- [ ] AppImage installs and plays a video on a Steam Machine
- [ ] tag pushed; run green; release has the AppImage, `install.sh`,
      `steam-art.zip` and `SHA256SUMS.txt`
