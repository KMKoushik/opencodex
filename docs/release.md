# Releasing the desktop app

GitHub Actions builds macOS installers and update packages for Apple silicon (`arm64`) and Intel (`x64`) and attaches them to a GitHub Release. The workflow is `.github/workflows/release.yml`.

## Publish a release

1. Pick a version. The tag sets it; package.json files are not edited.
2. Tag the commit and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. Watch the **Release desktop** workflow in the Actions tab. When it finishes, the release appears under Releases with:
   - `OpenCodex-0.2.0-arm64.dmg` for Apple silicon Macs
   - `OpenCodex-0.2.0-x64.dmg` for Intel Macs
   - Matching `.zip` update packages and `.blockmap` files
   - `latest-mac.yml` with update URLs, sizes, and SHA-512 hashes for both architectures

A tag with a suffix, such as `v0.2.0-beta.1`, publishes a prerelease. Installed apps check stable releases only. Release notes are generated from merged pull requests and commits. Never publish the feed before all referenced ZIPs are uploaded, or replace assets on an existing release.

## Test a build without releasing

Run **Release desktop** manually (Actions → Release desktop → Run workflow). It builds installers and update packages as a workflow artifact named `OpenCodex-<version>-dev.<run>-mac` and does not create a release. Every build first signs two native fixtures on one disposable Mac and tests install/relaunch on a separate fresh Mac that never imports or trusts the certificate. Only signed fixture ZIPs and the public certificate travel between these jobs; signing credentials stay on the signing runner.

To build locally instead:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false bun run --cwd apps/desktop package --mac --publish never -c.mac.identity=-
```

Artifacts land in `apps/desktop/release/`. Local ad-hoc builds are for testing only, not an update-compatible release.

## First installation

The app uses a private self-signed code-signing certificate, not an Apple Developer ID certificate. No paid Apple membership is needed, but this is **not notarization**: macOS still warns on first launch.

1. Open the DMG and drag OpenCodex to Applications.
2. Open it. If macOS says it can't verify the developer, open **System Settings → Privacy & Security** and click **Open Anyway**.
3. If macOS says the app is damaged, clear the download quarantine flag and open it again:

   ```sh
   xattr -cr /Applications/OpenCodex.app
   ```

OpenCodex needs OpenCode 2.x installed. The app reads your login shell's `PATH` at startup, so an `opencode` installed through your shell profile, Homebrew, or the OpenCode installer is found even when the app opens from Finder.

## In-app updates

After installing an updater-enabled release, OpenCodex checks GitHub Releases after startup and hourly. The sidebar offers **Update to v…**, download progress, then **Restart to update**. General settings provides a manual check and release notes. Nothing downloads automatically, and normal quit does not install an update. Save files and send drafts before restarting: unsaved in-memory changes are not preserved. OpenCode and running agents keep running.

Existing v0.1.1/ad-hoc installations need one manual installation of the first updater-enabled self-signed release. They have neither the updater nor its signing identity.

## Stable self-signed identity

Repository secrets (Settings → Secrets and variables → Actions) are required; missing secrets fail the build rather than publishing incompatible ad-hoc updates:

| Secret             | Value                                             |
| ------------------ | ------------------------------------------------- |
| `CSC_LINK`         | Base64 of the stable OpenCodex self-signed `.p12` |
| `CSC_KEY_PASSWORD` | Password for that `.p12`                          |

The private backup is in `~/.config/opencodex/signing/`, outside Git. Back up that directory securely, including its password. Its certificate expires in September 2046. **Never regenerate it for a release.** Losing or replacing the key means users must manually install a differently signed app; switching to Apple Developer ID also requires a deliberate migration rather than swapping secrets.

For initial setup in a new repository only (not this already-configured one):

```sh
bash scripts/create-signing-identity.sh
base64 -i "$HOME/.config/opencodex/signing/signing.p12" | gh secret set CSC_LINK
gh secret set CSC_KEY_PASSWORD < "$HOME/.config/opencodex/signing/password"
```

The creation script refuses to overwrite an existing signing directory. The import script pins the public SHA-256 certificate fingerprint so accidentally replacing secrets fails rather than stranding existing installs. A new repository needs its own initial fingerprint; this repository must keep the existing one. Certificate trust/import is restricted to disposable GitHub-hosted runners by `scripts/import-signing-identity.sh`; it must not run on developer machines. The custom signing hook keeps normal nested signing/verification and hardened-runtime entitlements but disables Apple Team-ID entitlement automation and timestamping for this identity. End users do not import the certificate or change trust settings. Update authentication comes from HTTPS, updater hashes, and Squirrel's same-identity bundle signature check, not Apple's notarization service.

## Not yet included

- Windows and Linux installers. electron-builder has targets configured, but the workflow builds macOS only.
