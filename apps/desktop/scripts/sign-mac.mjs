import { sign } from '@electron/osx-sign';

// Self-signed identities have no Apple Team ID. Skip Apple-only identity/entitlement automation;
// keep the normal inside-out code signing and verification, including nested Electron helpers.
export default async function signMac(options) {
  await sign({
    ...options,
    ...(process.env.OPENCODEX_SELF_SIGNED === 'true'
      ? {
          identityValidation: false,
          preAutoEntitlements: false,
          preEmbedProvisioningProfile: false,
          optionsForFile: (file, context) => ({
            ...options.optionsForFile?.(file, context),
            timestamp: 'none',
          }),
        }
      : {}),
  });
}
