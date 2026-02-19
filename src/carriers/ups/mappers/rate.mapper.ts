import { RateRequest } from '../../../domain/models/rate';
import { randomUUID } from 'crypto';

export function mapToUpsRequest(
  request: RateRequest,
  shipperNumber: string
): {
  RateRequest: {
    Request: {
      TransactionReference: {
        CustomerContext: string;
        TransactionIdentifier: string;
      };
    };
    Shipment: {
      Shipper: {
        Name: string;
        ShipperNumber: string;
        Address: {
          AddressLine: string[];
          City: string;
          StateProvinceCode: string;
          PostalCode: string;
          CountryCode: string;
        };
      };
      ShipTo: {
        Name: string;
        Address: {
          AddressLine: string[];
          City: string;
          StateProvinceCode: string;
          PostalCode: string;
          CountryCode: string;
        };
      };
      ShipFrom: {
        Name: string;
        Address: {
          AddressLine: string[];
          City: string;
          StateProvinceCode: string;
          PostalCode: string;
          CountryCode: string;
        };
      };
      PaymentDetails: {
        ShipmentCharge: {
          Type: string;
          BillShipper: {
            AccountNumber: string;
          };
        };
      };
      Service: {
        Code: string;
        Description: string;
      };
      NumOfPieces: string;
      Package: Array<{
        PackagingType?: {
          Code: string;
          Description: string;
        };
        Dimensions: {
          UnitOfMeasurement: {
            Code: string;
            Description: string;
          };
          Length: string;
          Width: string;
          Height: string;
        };
        PackageWeight: {
          UnitOfMeasurement: {
            Code: string;
            Description: string;
          };
          Weight: string;
        };
      }>;
    };
  };
} {
  return {
    RateRequest: {
      Request: {
        TransactionReference: {
          CustomerContext: 'RatingService',
          TransactionIdentifier: randomUUID(),
        },
      },
      Shipment: {
        Shipper: {
          Name: request.shipFrom.name,
          ShipperNumber: shipperNumber,
          Address: {
            AddressLine: request.shipFrom.addressLines,
            City: request.shipFrom.city,
            StateProvinceCode: request.shipFrom.state || '',
            PostalCode: request.shipFrom.postalCode,
            CountryCode: request.shipFrom.countryCode,
          },
        },
        ShipTo: {
          Name: request.shipTo.name,
          Address: {
            AddressLine: request.shipTo.addressLines,
            City: request.shipTo.city,
            StateProvinceCode: request.shipTo.state || '',
            PostalCode: request.shipTo.postalCode,
            CountryCode: request.shipTo.countryCode,
          },
        },
        ShipFrom: {
          Name: request.shipFrom.name,
          Address: {
            AddressLine: request.shipFrom.addressLines,
            City: request.shipFrom.city,
            StateProvinceCode: request.shipFrom.state || '',
            PostalCode: request.shipFrom.postalCode,
            CountryCode: request.shipFrom.countryCode,
          },
        },
        PaymentDetails: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: {
              AccountNumber: shipperNumber,
            },
          },
        },
        Service: {
          Code: '03',
          Description: 'Ground',
        },
        NumOfPieces: String(request.packages.length),
        Package: request.packages.map((pkg) => ({
          PackagingType: {
            Code: '02',
            Description: 'Packaging',
          },
          Dimensions: {
            UnitOfMeasurement: {
              Code: pkg.dimensionUnit,
              Description: pkg.dimensionUnit === 'IN' ? 'Inches' : 'Centimeters',
            },
            Length: String(pkg.length),
            Width: String(pkg.width),
            Height: String(pkg.height),
          },
          PackageWeight: {
            UnitOfMeasurement: {
              Code: pkg.weightUnit,
              Description: pkg.weightUnit === 'LBS' ? 'Pounds' : 'Kilograms',
            },
            Weight: String(pkg.weight),
          },
        })),
      },
    },
  };
}

export function parseUpsResponse(
  response: any
): {
  carrier: string;
  serviceCode: string;
  serviceName?: string;
  amount: number;
  currency: string;
  baseCharge?: number;
  transportationCharge?: number;
  alerts?: string[];
}[] {
  const RateResponse = response?.RateResponse;
  if (!RateResponse) {
    throw new Error('Invalid UPS response: missing RateResponse');
  }

  const RatedShipment = RateResponse.RatedShipment;
  if (!RatedShipment) {
    throw new Error('Invalid UPS response: missing RatedShipment');
  }

  const Service = RatedShipment.Service || {};
  const serviceCode = Service.Code || '';
  const serviceName = Service.Description || '';

  const TotalCharges = RatedShipment.TotalCharges || {};
  const amount = parseFloat(TotalCharges.MonetaryValue || '0');
  const currency = TotalCharges.CurrencyCode || 'USD';

  const RatedPackage = Array.isArray(RatedShipment.RatedPackage)
    ? RatedShipment.RatedPackage[0]
    : RatedShipment.RatedPackage;

  const baseCharge = RatedPackage?.BaseServiceCharge?.MonetaryValue
    ? parseFloat(RatedPackage.BaseServiceCharge.MonetaryValue)
    : undefined;

  const transportationCharge = RatedPackage?.TransportationCharges?.MonetaryValue
    ? parseFloat(RatedPackage.TransportationCharges.MonetaryValue)
    : undefined;

  const alerts: string[] = [];

  if (RatedShipment.RatedShipmentAlert && Array.isArray(RatedShipment.RatedShipmentAlert)) {
    RatedShipment.RatedShipmentAlert.forEach((alert: any) => {
      if (alert.Description) {
        alerts.push(alert.Description);
      }
    });
  }

  if (RateResponse.Response?.Alert && Array.isArray(RateResponse.Response.Alert)) {
    RateResponse.Response.Alert.forEach((alert: any) => {
      if (alert.Description) {
        alerts.push(alert.Description);
      }
    });
  }

  return [
    {
      carrier: 'UPS',
      serviceCode,
      serviceName: serviceName || undefined,
      amount,
      currency,
      baseCharge,
      transportationCharge,
      alerts: alerts.length > 0 ? alerts : undefined,
    },
  ];
}