export function mapToUpsRequest(req:any, shipper:string) {

  return {
    RateRequest: {
      Shipment: {
        Shipper: {
          Name: req.shipFrom.name,
          ShipperNumber: shipper
        },
        ShipTo: { Name: req.shipTo.name },
        ShipFrom: { Name: req.shipFrom.name },
        Package: req.packages.map((p:any) => ({
          PackageWeight: {
            UnitOfMeasurement: { Code: p.weightUnit },
            Weight: String(p.weight)
          }
        }))
      }
    }
  };
}