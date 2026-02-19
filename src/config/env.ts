import dotenv from "dotenv";

dotenv.config();

export const env = {
  baseUrl: process.env.UPS_BASE_URL!,
  clientId: process.env.UPS_CLIENT_ID!,
  clientSecret: process.env.UPS_CLIENT_SECRET!,
  shipperNumber: process.env.UPS_SHIPPER_NUMBER!,
};