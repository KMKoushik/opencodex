import { sign } from '@electron/osx-sign';

// Self-signed identities have no Apple Team ID. Disable only Apple's entitlement automation;
// keep the normal inside-out code signing and verification, including nested Electron helpers.
export default async function signMac(options) {
  await sign({
    ...options,
    ...(process.env.OPENCODEX_SELF_SIGNED === 'true'
      ? { preAutoEntitlements: false, preEmbedProvisioningProfile: false, timestamp: 'none' }
      : {}),
  });
}
