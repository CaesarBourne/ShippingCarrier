import { HttpClient } from "./core/http/http-client";
import { TokenManager } from "./core/auth/token-manager";
import { UpsRateOperation } from "./carriers/ups/operations/rate.operation";
import { ShippingService } from "./services/shipping.service";

const http = new HttpClient();

const tokenManager = new TokenManager(async () => {
  return {
    access_token: "mock-token",
    expires_in: 300
  };
});

const rateOp = new UpsRateOperation(http, tokenManager);
const service = new ShippingService(rateOp);

(async () => {

  const result = await service.getRates({
    shipFrom: { name: "Sender" },
    shipTo: { name: "Receiver" },
    packages: [{ weight: 1, weightUnit: "LBS" }]
  });

  console.log(result);

})();