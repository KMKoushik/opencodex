export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 502 | 503,
  ) {
    super(message);
  }
}
