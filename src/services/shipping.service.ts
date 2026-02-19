export class ShippingService {

  constructor(private rateOperation:any){}

  async getRates(req:any){
    return this.rateOperation.execute(req);
  }
}