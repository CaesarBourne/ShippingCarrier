import { RateRequest, RateQuote } from '../domain/models/rate';
import { ValidationError } from '../domain/errors';
import { RateRequestSchema } from '../domain/schemas/rate.schema';

export class ShippingService {
  constructor(private rateOperation: any) {}

  async getRates(request: RateRequest): Promise<RateQuote[]> {
    try {
      RateRequestSchema.parse(request);
    } catch (error: any) {
      throw new ValidationError(
        'Invalid rate request',
        { validationErrors: error.errors || error.message }
      );
    }

    return this.rateOperation.execute(request);
  }
}