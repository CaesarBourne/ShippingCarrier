export interface Address {
  name: string;
  addressLines: string[];
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string;
}

export interface Package {
  weight: number;
  weightUnit: "LBS" | "KGS";
  length: number;
  width: number;
  height: number;
  dimensionUnit: "IN" | "CM";
}

export interface RateRequest {
  shipFrom: Address;
  shipTo: Address;
  packages: Package[];
}

export interface RateQuote {
  carrier: string;
  serviceCode: string;
  serviceName?: string;
  amount: number;
  currency: string;
  baseCharge?: number;
  transportationCharge?: number;
  alerts?: string[];
}
