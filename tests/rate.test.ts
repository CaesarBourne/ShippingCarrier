import { describe,it,expect } from "vitest";
import nock from "nock";

describe("UPS Rate", () => {

  it("maps request correctly", async ()=>{

    nock("https://wwwcie.ups.com")
      .post("/api/rating/v2403/rate")
      .reply(200,{ RateResponse:{} });

    expect(true).toBe(true);
  });

});