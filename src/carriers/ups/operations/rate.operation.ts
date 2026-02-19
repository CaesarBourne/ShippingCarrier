import { env } from "../../../config/env";
import { mapToUpsRequest } from "../mappers/rate.mapper";

export class UpsRateOperation {

  constructor(
    private http:any,
    private tokenManager:any
  ) {}

  async execute(req:any) {

    const token = await this.tokenManager.getToken();

    const payload =
      mapToUpsRequest(req, env.shipperNumber);

    const res = await this.http.post(
      `${env.baseUrl}/api/rating/v2403/rate`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    return res.data;
  }
}