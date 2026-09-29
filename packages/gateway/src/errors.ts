export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 | 503,
  ) {
    super(message);
  }
}
