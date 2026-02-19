import { HttpClient } from './core/http/http-client';
import { UpsRateOperation } from './carriers/ups/operations/rate.operation';
import { ShippingService } from './services/shipping.service';
import { TokenManager } from './core/auth/token-manager';
import { RateRequest } from './domain/models/rate';

const http = new HttpClient();

const tokenManager = new TokenManager(async () => {
  return {
    access_token: 'mock-token',
    expires_in: 300,
  };
});

const rateOp = new UpsRateOperation(http, tokenManager);
const service = new ShippingService(rateOp);

(async () => {
  const request: RateRequest = {
    shipFrom: {
      name: 'Sender Company',
      addressLines: ['123 Main Street'],
      city: 'TIMONIUM',
      state: 'MD',
      postalCode: '21093',
      countryCode: 'US',
    },
    shipTo: {
      name: 'Receiver Company',
      addressLines: ['456 Oak Avenue'],
      city: 'Alpharetta',
      state: 'GA',
      postalCode: '30005',
      countryCode: 'US',
    },
    packages: [
      {
        weight: 7,
        weightUnit: 'LBS',
        length: 5,
        width: 5,
        height: 5,
        dimensionUnit: 'IN',
      },
    ],
  };

  try {
    const result = await service.getRates(request);
    console.log('Shipping rates:', result);
  } catch (error) {
    console.error('Error fetching rates:', error);
  }
})();