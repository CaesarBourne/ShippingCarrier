import { z } from 'zod';

export const AddressSchema = z.object({
  name: z.string().min(1, 'Address name is required'),
  addressLines: z
    .array(z.string().min(1, 'Address line cannot be empty'))
    .min(1, 'At least one address line is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional(),
  postalCode: z.string().min(1, 'Postal code is required'),
  countryCode: z.string().length(2, 'Country code must be a 2-letter ISO code (e.g., US, GB)'),
});

export const PackageSchema = z.object({
  weight: z.number().positive('Weight must be a positive number'),
  weightUnit: z.enum(['LBS', 'KGS']).refine(
    (val) => ['LBS', 'KGS'].includes(val),
    'Weight unit must be either LBS or KGS'
  ),
  length: z.number().positive('Length must be a positive number'),
  width: z.number().positive('Width must be a positive number'),
  height: z.number().positive('Height must be a positive number'),
  dimensionUnit: z.enum(['IN', 'CM']).refine(
    (val) => ['IN', 'CM'].includes(val),
    'Dimension unit must be either IN (inches) or CM (centimeters)'
  ),
});

export const RateRequestSchema = z.object({
  shipFrom: AddressSchema,
  shipTo: AddressSchema,
  packages: z
    .array(PackageSchema)
    .min(1, 'At least one package is required'),
});