export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 413 | 422 | 502 | 503,
  ) {
    super(message);
  }
}
