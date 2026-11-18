# Releasing

Releases are cut from tags, but nothing is automatic. Pushing a tag builds
nothing and publishes nothing. You create the release yourself, then run
[`.github/workflows/release.yml`](../.github/workflows/release.yml) by hand from
the tagged commit; it takes that tag as the release version and attaches the
artifacts.

## Versioning

Semantic versioning, tagged `vMAJOR.MINOR.PATCH`.

| Bump | When |
|---|---|
| MAJOR | A stored format changes incompatibly, or the controls are reorganised in a way that breaks muscle memory |
| MINOR | A new user-facing capability |
| PATCH | Fixes only, no new behaviour |

Pre-releases use a suffix: `v0.2.0-beta.1`, `v0.2.0-rc.1`. Mark them **Set as a
pre-release** when creating the release. The workflow refuses to upload a
hyphenated tag to a release that is not marked pre-release (and a plain tag to
one that is), so a beta cannot become the "latest" download.

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

## Cutting a release

1. Bump `version` in `package.json`.
2. Commit it on `main` and push.
3. Tag and push the tag. This does not start a build:

   ```sh
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

4. Create the release in the GitHub UI for that tag. Tick **Set as a
   pre-release** if the tag has a hyphen.
5. Go to **Actions → Release → Run workflow**. Under **Use workflow from**, pick
   the tag (or `main` if its head is the tagged commit), and leave `dry_run`
   off.
6. Check the run and the assets on the release.

There is no version to type in: the run reads the semver tag `vMAJOR.MINOR.PATCH`
that points at the commit it starts from and uses it as the release version. It
fails immediately if that commit is untagged, carries more than one release tag,
or its tag disagrees with `package.json`.

It also checks up front that the release exists and that its pre-release
checkbox matches the tag, before running `npm run verify` (typecheck and tests),
building the AppImage, and uploading it and the checksums. A missing or
mismatched release therefore fails in seconds rather than after the build.

The publish job only runs after the Linux build passes, so a failed build leaves
the release untouched.

## Testing the process

The tag must match `package.json` exactly, so choose the version first. A
rehearsal uses a prerelease version and `dry_run`; that runs the same checks and
the AppImage build but skips the publish job, so no release is needed and
nothing is modified. A dry run needs no tag either: it can build any commit as
it stands, and if the commit is tagged the version checks still run.

1. Set `version` in `package.json` to the prerelease you are rehearsing, for
   example `0.2.0-rc.1`. Commit it and push.
2. Optionally tag that commit and push the tag, to rehearse the tag checks too:

   ```sh
   git tag -a v0.2.0-rc.1 -m "release rehearsal"
   git push origin v0.2.0-rc.1
   ```

3. Run **Actions → Release** with `dry_run` on, from the tagged commit or from
   `main`.
4. Download the `linux` artifact from the run.
5. Install and run the AppImage on a Steam Machine or Deck: sign in, play a
   video, use the controller. See [install-steamos.md](install-steamos.md).
6. If the build is not what you want, fix it, and if you tagged it, delete the
   tag and repeat:

   ```sh
   git tag -d v0.2.0-rc.1
   git push origin :refs/tags/v0.2.0-rc.1
   ```

7. To ship, either keep the prerelease version and create the release with
   **Set as a pre-release** ticked, or bump to the stable version, commit, tag
   and rehearse once more. Then create the release and run the workflow with
   `dry_run` off.

If you are already on the version you intend to ship, you can rehearse on its
tag directly: tag it, run with `dry_run` on, then create the release and run
again with `dry_run` off.

## Re-running

Run the workflow again from the same tagged commit. Uploads use `--clobber`, so
artifacts are replaced rather than duplicated.

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

Drop-In has no in-app updater. To update, re-run the installer: it replaces
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

- [ ] `package.json` version bumped and committed on `main`
- [ ] `npm run verify` passes (typecheck and tests)
- [ ] `dry_run` workflow passed on the release tag or a prerelease of it
- [ ] AppImage installs and plays a video on a Steam Machine
- [ ] Tag matches `package.json` exactly (`v` prefix)
- [ ] Release created; pre-release checkbox matches the tag suffix
- [ ] Run finished; assets and `SHA256SUMS.txt` are on the release
