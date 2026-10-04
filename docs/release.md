# Releasing the desktop app

GitHub Actions builds macOS DMGs for Apple silicon (`arm64`) and Intel (`x64`) and attaches them to a GitHub Release. The workflow is `.github/workflows/release.yml`.

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

A tag with a suffix, such as `v0.2.0-beta.1`, publishes a prerelease. Release notes are generated from merged pull requests and commits.

## Test a build without releasing

Run **Release desktop** manually (Actions → Release desktop → Run workflow). It builds both DMGs as a workflow artifact named `OpenCodex-<version>-dev.<run>-mac` and does not create a release.

To build locally instead:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false bun run --cwd apps/desktop package --mac --publish never -c.mac.identity=-
```

The DMGs land in `apps/desktop/release/`.

## Installing an unsigned build

Without an Apple Developer ID certificate, the app is ad-hoc signed and not notarized, so macOS warns on first launch:

1. Open the DMG and drag OpenCodex to Applications.
2. Open it. If macOS says it can't verify the developer, open **System Settings → Privacy & Security** and click **Open Anyway**.
3. If macOS says the app is damaged, clear the download quarantine flag and open it again:

   ```sh
   xattr -cr /Applications/OpenCodex.app
   ```

OpenCodex needs OpenCode 2.x installed. The app reads your login shell's `PATH` at startup, so an `opencode` installed through your shell profile, Homebrew, or the OpenCode installer is found even when the app opens from Finder.

## Signing and notarization (optional)

Add these repository secrets (Settings → Secrets and variables → Actions). The workflow signs only when the certificate secrets are present, and notarizes only when the API key secrets are also present.

| Secret             | Value                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `CSC_LINK`         | Base64 of the Developer ID Application certificate exported as `.p12` (`base64 -i cert.p12`) |
| `CSC_KEY_PASSWORD` | Password for that `.p12`                                                                     |
| `APPLE_API_KEY`    | Contents of the App Store Connect API key file (`AuthKey_XXXX.p8`)                           |
| `APPLE_API_KEY_ID` | That key's ID                                                                                |
| `APPLE_API_ISSUER` | The issuer ID from App Store Connect → Users and Access → Integrations                       |

Signed, notarized builds open without the warnings above. The app uses the hardened runtime with Electron's standard entitlements (`apps/desktop/build/entitlements.mac.plist`).

## Not yet included

- Auto-updates. Users download new versions from Releases.
- Windows and Linux installers. electron-builder has targets configured, but the workflow builds macOS only.
