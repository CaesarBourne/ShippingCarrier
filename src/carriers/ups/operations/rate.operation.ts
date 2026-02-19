import { env } from '../../../config/env';
import { RateRequest, RateQuote } from '../../../domain/models/rate';
import { mapToUpsRequest, parseUpsResponse } from '../mappers/rate.mapper';
import {
  AuthenticationError,
  HttpServerError,
  HttpClientError,
  MalformedResponseError,
  TimeoutError,
  RateLimitError,
  NetworkError,
} from '../../../domain/errors';

export class UpsRateOperation {
  constructor(
    private http: any,
    private tokenManager: any
  ) {}

  async execute(request: RateRequest): Promise<RateQuote[]> {
    try {
      const token = await this.tokenManager.getToken();

      const payload = mapToUpsRequest(request, env.shipperNumber);

      const response = await this.http.post(
        `${env.baseUrl}/api/rating/v2403/rate`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            transID: this.generateTransactionId(),
            transactionSrc: 'RatingService',
          },
        }
      );

      const quotes = parseUpsResponse(response.data);
      return quotes;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new AuthenticationError(
          'UPS authentication failed: Invalid credentials or expired token',
          { originalError: error.message, status: 401 }
        );
      }

      if (error.response?.status === 400) {
        throw new HttpClientError(
          400,
          'UPS rejected request: Invalid shipment data',
          {
            originalError: error.response.data,
            request: error.config,
          }
        );
      }

      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        throw new RateLimitError(
          'UPS rate limit exceeded',
          retryAfter ? parseInt(retryAfter) * 1000 : undefined,
          { originalError: error.message }
        );
      }

      if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
        throw new HttpClientError(
          error.response.status,
          `UPS request failed: HTTP ${error.response.status}`,
          { originalError: error.response.data }
        );
      }

      if (error.response?.status && error.response.status >= 500) {
        throw new HttpServerError(
          error.response.status,
          `UPS server error: HTTP ${error.response.status}`,
          true,
          { originalError: error.response.data }
        );
      }

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new TimeoutError(
          'UPS request timed out',
          30000,
          { originalError: error.message }
        );
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new NetworkError(
          'Network error connecting to UPS API',
          error,
          { code: error.code, originalError: error.message }
        );
      }

      if (error.message?.includes('JSON') || error instanceof SyntaxError) {
        throw new MalformedResponseError(
          'UPS API returned invalid JSON',
          error.response?.data,
          { originalError: error.message }
        );
      }

      if (error.message?.includes('missing') || error.message?.includes('RateResponse')) {
        throw new MalformedResponseError(
          'UPS API response missing required fields',
          JSON.stringify(error.response?.data),
          { originalError: error.message }
        );
      }

      if (error.name?.includes('Error') && error.code) {
        throw error;
      }

      throw new HttpServerError(
        500,
        'Unknown error calling UPS API',
        true,
        { originalError: error.message || String(error) }
      );
    }
  }

  private generateTransactionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}