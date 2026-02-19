export class ShippingServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "ShippingServiceError";
    Object.setPrototypeOf(this, ShippingServiceError.prototype);
  }
}

export class AuthenticationError extends ShippingServiceError {
  constructor(message: string = "Authentication failed", details?: Record<string, any>) {
    super("AUTH_FAILED", message, 401, details);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class ValidationError extends ShippingServiceError {
  constructor(message: string = "Validation failed", details?: Record<string, any>) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class TimeoutError extends ShippingServiceError {
  constructor(
    message: string = "Request timeout",
    public timeoutMs?: number,
    details?: Record<string, any>
  ) {
    super("TIMEOUT", message, undefined, details);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class HttpServerError extends ShippingServiceError {
  constructor(
    statusCode: number,
    message: string = "Server error",
    public retryable: boolean = true,
    details?: Record<string, any>
  ) {
    super("HTTP_SERVER_ERROR", message, statusCode, details);
    this.name = "HttpServerError";
    Object.setPrototypeOf(this, HttpServerError.prototype);
  }
}

export class HttpClientError extends ShippingServiceError {
  constructor(
    statusCode: number,
    message: string = "Client error",
    details?: Record<string, any>
  ) {
    super("HTTP_CLIENT_ERROR", message, statusCode, details);
    this.name = "HttpClientError";
    Object.setPrototypeOf(this, HttpClientError.prototype);
  }
}

export class MalformedResponseError extends ShippingServiceError {
  constructor(
    message: string = "Malformed response from API",
    public rawResponse?: string,
    details?: Record<string, any>
  ) {
    super("MALFORMED_RESPONSE", message, undefined, details);
    this.name = "MalformedResponseError";
    Object.setPrototypeOf(this, MalformedResponseError.prototype);
  }
}

export class RateLimitError extends ShippingServiceError {
  constructor(
    message: string = "Rate limit exceeded",
    public retryAfterMs?: number,
    details?: Record<string, any>
  ) {
    super("RATE_LIMIT", message, 429, details);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class NetworkError extends ShippingServiceError {
  constructor(
    message: string = "Network error",
    public originalError?: Error,
    details?: Record<string, any>
  ) {
    super("NETWORK_ERROR", message, undefined, details);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}