import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nock from "nock";
import { TokenManager } from "../src/core/auth/token-manager";
import { HttpClient } from "../src/core/http/http-client";
import { mapToUpsRequest, parseUpsResponse } from "../src/carriers/ups/mappers/rate.mapper";
import { UpsRateOperation } from "../src/carriers/ups/operations/rate.operation";
import { ShippingService } from "../src/services/shipping.service";
import { RateRequest } from "../src/domain/models/rate";
import {
  AuthenticationError,
  HttpClientError,
  HttpServerError,
  ValidationError,
} from "../src/domain/errors";



describe("TokenManager", () => {
  describe("Token Caching", () => {
    it("should cache valid token and return it without refreshing", async () => {
      const fetchToken = vi.fn().mockResolvedValue({
        access_token: "cached-token",
        expires_in: 3600,
      });

      const tokenManager = new TokenManager(fetchToken);

      const token1 = await tokenManager.getToken();
      const token2 = await tokenManager.getToken();

      expect(token1).toBe("cached-token");
      expect(token2).toBe("cached-token");
      expect(fetchToken).toHaveBeenCalledTimes(1); 
    });

    it("should return cached token before expiry", async () => {
      const fetchToken = vi.fn().mockResolvedValue({
        access_token: "valid-token",
        expires_in: 3600,
      });

      const tokenManager = new TokenManager(fetchToken);
      const token = await tokenManager.getToken();

      expect(token).toBe("valid-token");
      expect(fetchToken).toHaveBeenCalledTimes(1);
    });
  });

  describe("Token Refresh", () => {
    it("should refresh token on expiry", async () => {
      vi.useFakeTimers();
      const fetchToken = vi.fn()
        .mockResolvedValueOnce({ access_token: "token-1", expires_in: 1 })
        .mockResolvedValueOnce({ access_token: "token-2", expires_in: 3600 });

      const tokenManager = new TokenManager(fetchToken);

      const token1 = await tokenManager.getToken();
      expect(token1).toBe("token-1");

      // Fast forward past token expiry (1 sec + 30sec buffer = 31 sec)
      vi.advanceTimersByTime(32000);

      const token2 = await tokenManager.getToken();
      expect(token2).toBe("token-2");
      expect(fetchToken).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should apply 30s buffer before token expiry", async () => {
      vi.useFakeTimers();
      const fetchToken = vi.fn()
        .mockResolvedValueOnce({ access_token: "token-1", expires_in: 100 })
        .mockResolvedValueOnce({ access_token: "token-2", expires_in: 3600 });

      const tokenManager = new TokenManager(fetchToken);

      await tokenManager.getToken();
      expect(fetchToken).toHaveBeenCalledTimes(1);

      // Advance by 75 seconds (should trigger refresh due to 30s buffer)
      vi.advanceTimersByTime(75000);

      await tokenManager.getToken();
      expect(fetchToken).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe("Concurrent Requests", () => {
    it("should handle concurrent token requests (return same promise)", async () => {
      const fetchToken = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => 
          resolve({ access_token: "token", expires_in: 3600 }), 100))
      );

      const tokenManager = new TokenManager(fetchToken);

      const promises = [
        tokenManager.getToken(),
        tokenManager.getToken(),
        tokenManager.getToken(),
      ];

      const tokens = await Promise.all(promises);

      expect(tokens).toEqual(["token", "token", "token"]);
      expect(fetchToken).toHaveBeenCalledTimes(1); // Called only once despite 3 requests
    });
  });

  describe("Error Handling", () => {
    it("should propagate fetchToken errors", async () => {
      const fetchToken = vi.fn().mockRejectedValue(new Error("Network error"));
      const tokenManager = new TokenManager(fetchToken);

      await expect(tokenManager.getToken()).rejects.toThrow("Network error");
    });
  });
});

// ============================================================================
// PHASE 2: HTTP CLIENT TESTS
// ============================================================================

describe("HttpClient", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("POST Requests", () => {
    it("should make successful POST request", async () => {
      nock("https://api.example.com")
        .post("/endpoint", { data: "test" })
        .reply(200, { success: true });

      const httpClient = new HttpClient();
      const response = await httpClient.post("https://api.example.com/endpoint", {
        data: "test",
      });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
    });

    it("should pass correct URL and configs", async () => {
      nock("https://api.example.com", {
        reqheaders: {
          Authorization: "Bearer token123",
          "Content-Type": "application/json",
        },
      })
        .post("/api/test", { key: "value" })
        .reply(200, { result: "ok" });

      const httpClient = new HttpClient();
      const response = await httpClient.post(
        "https://api.example.com/api/test",
        { key: "value" },
        {
          headers: {
            Authorization: "Bearer token123",
            "Content-Type": "application/json",
          },
        }
      );

      expect(response.data).toEqual({ result: "ok" });
    });

    it("should return response data", async () => {
      const mockData = { rates: [{ code: "GND", price: 12.5 }] };
      nock("https://api.ups.com").post("/rate").reply(200, mockData);

      const httpClient = new HttpClient();
      const response = await httpClient.post("https://api.ups.com/rate", {});

      expect(response.data).toEqual(mockData);
    });
  });

  describe("Error Handling", () => {
    it("should handle HTTP 4xx errors", async () => {
      nock("https://api.example.com")
        .post("/endpoint")
        .reply(400, { error: "Bad Request" });

      const httpClient = new HttpClient();

      await expect(
        httpClient.post("https://api.example.com/endpoint", {})
      ).rejects.toThrow();
    });

    it("should handle HTTP 5xx errors", async () => {
      nock("https://api.example.com")
        .post("/endpoint")
        .reply(500, { error: "Internal Server Error" });

      const httpClient = new HttpClient();

      await expect(
        httpClient.post("https://api.example.com/endpoint", {})
      ).rejects.toThrow();
    });
  });
});

// ============================================================================
// PHASE 3: RATE MAPPER TESTS
// ============================================================================

describe("Rate Mapper", () => {
  describe("Complete Request Mapping", () => {
    it("should map complete request with all fields", () => {
      const request: RateRequest = {
        shipFrom: {
          name: "Sender Corp",
          addressLines: ["123 Main St"],
          city: "New York",
          state: "NY",
          postalCode: "10001",
          countryCode: "US",
        },
        shipTo: {
          name: "Receiver Inc",
          addressLines: ["456 Oak Ave"],
          city: "Los Angeles",
          state: "CA",
          postalCode: "90001",
          countryCode: "US",
        },
        packages: [
          {
            weight: 5,
            weightUnit: "LBS",
            length: 10,
            width: 8,
            height: 6,
            dimensionUnit: "IN",
          },
        ],
      };

      const mapped = mapToUpsRequest(request, "12345");

      expect(mapped).toHaveProperty("RateRequest");
      expect(mapped.RateRequest).toHaveProperty("Shipment");
      expect(mapped.RateRequest.Shipment).toHaveProperty("ShipFrom");
      expect(mapped.RateRequest.Shipment).toHaveProperty("ShipTo");
      expect(mapped.RateRequest.Shipment).toHaveProperty("Package");
    });

    it("should include shipper number", () => {
      const request: RateRequest = {
        shipFrom: {
          name: "Sender",
          addressLines: ["123 Main"],
          city: "NY",
          postalCode: "10001",
          countryCode: "US",
        },
        shipTo: {
          name: "Receiver",
          addressLines: ["456 Oak"],
          city: "LA",
          postalCode: "90001",
          countryCode: "US",
        },
        packages: [{ weight: 1, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const mapped = mapToUpsRequest(request, "SHIPPER123");

      expect(mapped.RateRequest.Shipment.Shipper.ShipperNumber).toBe("SHIPPER123");
    });

    it("should format correct UPS API structure", () => {
      const request: RateRequest = {
        shipFrom: {
          name: "Test",
          addressLines: ["1"],
          city: "NY",
          postalCode: "10001",
          countryCode: "US",
        },
        shipTo: {
          name: "Test2",
          addressLines: ["2"],
          city: "LA",
          postalCode: "90001",
          countryCode: "US",
        },
        packages: [{ weight: 1, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const mapped = mapToUpsRequest(request, "123");
      const structure = mapped.RateRequest.Shipment;

      expect(structure.Shipper).toBeDefined();
      expect(structure.ShipFrom).toBeDefined();
      expect(structure.ShipTo).toBeDefined();
      expect(structure.Package).toBeDefined();
      expect(Array.isArray(structure.Package)).toBe(true);
    });
  });

  describe("Address Mapping", () => {
    it("should map ship from address", () => {
      const request: RateRequest = {
        shipFrom: {
          name: "Origin Corp",
          addressLines: ["100 Main St"],
          city: "Chicago",
          state: "IL",
          postalCode: "60601",
          countryCode: "US",
        },
        shipTo: {
          name: "Dest",
          addressLines: ["1"],
          city: "LA",
          postalCode: "90001",
          countryCode: "US",
        },
        packages: [{ weight: 1, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const mapped = mapToUpsRequest(request, "123");

      expect(mapped.RateRequest.Shipment.ShipFrom.Name).toBe("Origin Corp");
    });

    it("should map ship to address", () => {
      const request: RateRequest = {
        shipFrom: {
          name: "Src",
          addressLines: ["1"],
          city: "NY",
          postalCode: "10001",
          countryCode: "US",
        },
        shipTo: {
          name: "Destination Ltd",
          addressLines: ["200 Oak Ave"],
          city: "Seattle",
          postalCode: "98101",
          countryCode: "US",
        },
        packages: [{ weight: 1, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const mapped = mapToUpsRequest(request, "123");

      expect(mapped.RateRequest.Shipment.ShipTo.Name).toBe("Destination Ltd");
    });
  });

  describe("Package Mapping", () => {
    it("should map single package", () => {
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [
          {
            weight: 10,
            weightUnit: "LBS",
            length: 20,
            width: 15,
            height: 10,
            dimensionUnit: "IN",
          },
        ],
      };

      const mapped = mapToUpsRequest(request, "123");

      expect(mapped.RateRequest.Shipment.Package).toHaveLength(1);
      expect(mapped.RateRequest.Shipment.Package[0].PackageWeight.Weight).toBe("10");
      expect(mapped.RateRequest.Shipment.Package[0].PackageWeight.UnitOfMeasurement.Code).toBe("LBS");
    });

    it("should map multiple packages", () => {
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [
          { weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" },
          { weight: 3, weightUnit: "LBS", length: 12, width: 10, height: 8, dimensionUnit: "IN" },
          { weight: 7, weightUnit: "KGS", length: 25, width: 20, height: 15, dimensionUnit: "CM" },
        ],
      };

      const mapped = mapToUpsRequest(request, "123");

      expect(mapped.RateRequest.Shipment.Package).toHaveLength(3);
      expect(mapped.RateRequest.Shipment.Package[0].PackageWeight.Weight).toBe("5");
      expect(mapped.RateRequest.Shipment.Package[1].PackageWeight.Weight).toBe("3");
      expect(mapped.RateRequest.Shipment.Package[2].PackageWeight.Weight).toBe("7");
    });

    it("should map weight correctly", () => {
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 25.5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const mapped = mapToUpsRequest(request, "123");

      expect(mapped.RateRequest.Shipment.Package[0].PackageWeight.Weight).toBe("25.5");
    });

    it("should map weight units (LBS and KGS)", () => {
      const requestLBS: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const requestKGS: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 2, weightUnit: "KGS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const mappedLBS = mapToUpsRequest(requestLBS, "123");
      const mappedKGS = mapToUpsRequest(requestKGS, "123");

      expect(mappedLBS.RateRequest.Shipment.Package[0].PackageWeight.UnitOfMeasurement.Code).toBe("LBS");
      expect(mappedKGS.RateRequest.Shipment.Package[0].PackageWeight.UnitOfMeasurement.Code).toBe("KGS");
    });
  });
});

// ============================================================================
// PHASE 4: UPS RATE OPERATION TESTS
// ============================================================================

describe("UpsRateOperation", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const validUpsResponse = {
    RateResponse: {
      Response: { ResponseStatus: { Code: "1", Description: "Success" } },
      RatedShipment: {
        Service: { Code: "03", Description: "Ground" },
        TotalCharges: { CurrencyCode: "USD", MonetaryValue: "15.54" },
        RatedPackage: {
          BaseServiceCharge: { MonetaryValue: "14.46" },
          TransportationCharges: { MonetaryValue: "15.54" },
        },
      },
    },
  };

  describe("Successful Rate Retrieval", () => {
    it("should fetch and return parsed rates", async () => {
      nock("https://wwwcie.ups.com")
        .post("/api/rating/v2403/rate")
        .reply(200, validUpsResponse);

      const httpClient = new HttpClient();
      const tokenManager = new TokenManager(async () => ({
        access_token: "test-token",
        expires_in: 3600,
      }));

      const operation = new UpsRateOperation(httpClient, tokenManager);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const result = await operation.execute(request);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].carrier).toBe("UPS");
      expect(result[0].serviceCode).toBe("03");
      expect(result[0].amount).toBe(15.54);
    });
  });

  describe("Token Management", () => {
    it("should get token before API call", async () => {
      nock("https://wwwcie.ups.com")
        .post("/api/rating/v2403/rate")
        .reply(200, validUpsResponse);

      const fetchToken = vi.fn().mockResolvedValue({
        access_token: "test-token",
        expires_in: 3600,
      });

      const httpClient = new HttpClient();
      const tokenManager = new TokenManager(fetchToken);
      const operation = new UpsRateOperation(httpClient, tokenManager);

      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      await operation.execute(request);

      expect(fetchToken).toHaveBeenCalled();
    });
  });

  describe("HTTP Status Handling", () => {
    it("should handle 200 response with valid UPS format", async () => {
      nock("https://wwwcie.ups.com").post("/api/rating/v2403/rate").reply(200, validUpsResponse);

      const httpClient = new HttpClient();
      const tokenManager = new TokenManager(async () => ({
        access_token: "token",
        expires_in: 3600,
      }));

      const operation = new UpsRateOperation(httpClient, tokenManager);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const result = await operation.execute(request);
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(15.54);
    });

    it("should handle 400 bad request errors", async () => {
      nock("https://wwwcie.ups.com")
        .post("/api/rating/v2403/rate")
        .reply(400, { error: "Invalid request" });

      const httpClient = new HttpClient();
      const tokenManager = new TokenManager(async () => ({
        access_token: "token",
        expires_in: 3600,
      }));

      const operation = new UpsRateOperation(httpClient, tokenManager);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      await expect(operation.execute(request)).rejects.toThrow(HttpClientError);
    });

    it("should handle 401 unauthorized errors", async () => {
      nock("https://wwwcie.ups.com")
        .post("/api/rating/v2403/rate")
        .reply(401, { error: "Unauthorized" });

      const httpClient = new HttpClient();
      const tokenManager = new TokenManager(async () => ({
        access_token: "invalid-token",
        expires_in: 3600,
      }));

      const operation = new UpsRateOperation(httpClient, tokenManager);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      await expect(operation.execute(request)).rejects.toThrow(AuthenticationError);
    });

    it("should handle 500 server errors", async () => {
      nock("https://wwwcie.ups.com")
        .post("/api/rating/v2403/rate")
        .reply(500, { error: "Internal Server Error" });

      const httpClient = new HttpClient();
      const tokenManager = new TokenManager(async () => ({
        access_token: "token",
        expires_in: 3600,
      }));

      const operation = new UpsRateOperation(httpClient, tokenManager);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      await expect(operation.execute(request)).rejects.toThrow(HttpServerError);
    });
  });
});

// ============================================================================
// PHASE 5: SHIPPING SERVICE TESTS
// ============================================================================

describe("ShippingService", () => {
  describe("Basic Functionality", () => {
    it("should call rateOperation.execute", async () => {
      const mockRateOp = {
        execute: vi.fn().mockResolvedValue({ RateResponse: {} }),
      };

      const service = new ShippingService(mockRateOp);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      await service.getRates(request);

      expect(mockRateOp.execute).toHaveBeenCalledWith(request);
    });

    it("should return operation result", async () => {
      const mockResult = { RateResponse: { rates: [] } };
      const mockRateOp = {
        execute: vi.fn().mockResolvedValue(mockResult),
      };

      const service = new ShippingService(mockRateOp);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      const result = await service.getRates(request);

      expect(result).toEqual(mockResult);
    });

    it("should propagate errors from operation", async () => {
      const mockRateOp = {
        execute: vi.fn().mockRejectedValue(new Error("Operation failed")),
      };

      const service = new ShippingService(mockRateOp);
      const request: RateRequest = {
        shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
        shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
        packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
      };

      await expect(service.getRates(request)).rejects.toThrow("Operation failed");
    });
  });
});

// ============================================================================
// PHASE 6: INTEGRATION TESTS
// ============================================================================

describe("Integration - Full Flow", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const validUpsResponse = {
    RateResponse: {
      RatedShipment: {
        Service: { Code: "03", Description: "Ground" },
        TotalCharges: { CurrencyCode: "USD", MonetaryValue: "15.54" },
        RatedPackage: {
          BaseServiceCharge: { MonetaryValue: "14.46" },
          TransportationCharges: { MonetaryValue: "15.54" },
        },
      },
      Response: { ResponseStatus: { Code: "1", Description: "Success" } },
    },
  };

  it("should complete full flow: request → validation → token → api → response", async () => {
    nock("https://wwwcie.ups.com")
      .post("/api/rating/v2403/rate")
      .reply(200, validUpsResponse);

    const httpClient = new HttpClient();
    const tokenManager = new TokenManager(async () => ({
      access_token: "integration-token",
      expires_in: 3600,
    }));

    const rateOp = new UpsRateOperation(httpClient, tokenManager);
    const service = new ShippingService(rateOp);

    const request: RateRequest = {
      shipFrom: {
        name: "Warehouse A",
        addressLines: ["100 Industrial Way"],
        city: "Chicago",
        state: "IL",
        postalCode: "60601",
        countryCode: "US",
      },
      shipTo: {
        name: "Customer B",
        addressLines: ["200 Market St"],
        city: "San Francisco",
        state: "CA",
        postalCode: "94102",
        countryCode: "US",
      },
      packages: [
        {
          weight: 10,
          weightUnit: "LBS",
          length: 24,
          width: 18,
          height: 12,
          dimensionUnit: "IN",
        },
      ],
    };

    const result = await service.getRates(request);

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].carrier).toBe("UPS");
    expect(result[0].amount).toBe(15.54);
    expect(result[0].serviceCode).toBe("03");
  });

  it("should handle multiple package shipment", async () => {
    const multiPackageResponse = {
      RateResponse: {
        RatedShipment: {
          Service: { Code: "01", Description: "Next Day Air" },
          TotalCharges: { CurrencyCode: "USD", MonetaryValue: "45.00" },
          RatedPackage: {
            BaseServiceCharge: { MonetaryValue: "40.00" },
            TransportationCharges: { MonetaryValue: "45.00" },
          },
        },
      },
    };

    nock("https://wwwcie.ups.com")
      .post("/api/rating/v2403/rate")
      .reply(200, multiPackageResponse);

    const httpClient = new HttpClient();
    const tokenManager = new TokenManager(async () => ({
      access_token: "token",
      expires_in: 3600,
    }));

    const rateOp = new UpsRateOperation(httpClient, tokenManager);
    const service = new ShippingService(rateOp);

    const request: RateRequest = {
      shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
      shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
      packages: [
        { weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" },
        { weight: 3, weightUnit: "LBS", length: 12, width: 10, height: 8, dimensionUnit: "IN" },
        { weight: 7, weightUnit: "KGS", length: 25, width: 20, height: 15, dimensionUnit: "CM" },
      ],
    };

    const result = await service.getRates(request);

    expect(result[0].amount).toBe(45.0);
    expect(result[0].serviceCode).toBe("01");
  });

  it("should propagate errors through all layers", async () => {
    nock("https://wwwcie.ups.com")
      .post("/api/rating/v2403/rate")
      .reply(500, { error: "Server error" });

    const httpClient = new HttpClient();
    const tokenManager = new TokenManager(async () => ({
      access_token: "token",
      expires_in: 3600,
    }));

    const rateOp = new UpsRateOperation(httpClient, tokenManager);
    const service = new ShippingService(rateOp);

    const request: RateRequest = {
      shipFrom: { name: "A", addressLines: ["1"], city: "NY", postalCode: "10001", countryCode: "US" },
      shipTo: { name: "B", addressLines: ["2"], city: "LA", postalCode: "90001", countryCode: "US" },
      packages: [{ weight: 5, weightUnit: "LBS", length: 10, width: 8, height: 6, dimensionUnit: "IN" }],
    };

    await expect(service.getRates(request)).rejects.toThrow(HttpServerError);
  });
});
