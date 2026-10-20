import { z } from 'zod';

export const REMOTE_DEFAULT_PORT = 4317;

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, '').replace(/\/+$/, ''))
  .pipe(
    z
      .string()
      .regex(
        /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/,
        'Enter a hostname such as opencodex.example.com.',
      ),
  );

export const remoteTunnelSchema = z.enum(['token', 'external']);

/** An empty token keeps the saved one; the saved token is never sent back to the UI. */
export const remoteConfigSchema = z.object({
  enabled: z.boolean(),
  hostname: hostname.nullable(),
  port: z.number().int().min(1024).max(65535),
  tunnel: remoteTunnelSchema,
  token: z.string().trim().max(4096).optional(),
});

export const remoteDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  created: z.number(),
  seen: z.number().nullable(),
});

export const remoteStatusSchema = z.object({
  enabled: z.boolean(),
  hostname: z.string().nullable(),
  port: z.number(),
  tunnel: remoteTunnelSchema,
  tokenSet: z.boolean(),
  /** Whether this gateway serves the app itself; development gateways serve only the API. */
  served: z.boolean(),
  listener: z.object({
    state: z.enum(['off', 'listening', 'failed']),
    message: z.string().optional(),
  }),
  connector: z.object({
    state: z.enum(['off', 'starting', 'connected', 'missing', 'failed']),
    connections: z.number(),
    message: z.string().optional(),
  }),
  devices: z.array(remoteDeviceSchema),
});

export const remotePairCodeSchema = z.object({
  code: z.string(),
  url: z.string(),
  expires: z.number(),
});

export const remotePairSchema = z.object({ code: z.string().trim().min(1).max(32) });

export const remoteSessionSchema = z.object({ remote: z.boolean(), paired: z.boolean() });

export type RemoteConfig = z.infer<typeof remoteConfigSchema>;
export type RemoteDevice = z.infer<typeof remoteDeviceSchema>;
export type RemoteStatus = z.infer<typeof remoteStatusSchema>;
export type RemotePairCode = z.infer<typeof remotePairCodeSchema>;
export type RemoteSession = z.infer<typeof remoteSessionSchema>;
