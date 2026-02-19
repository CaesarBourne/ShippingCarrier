import axios from "axios";

export class HttpClient {
  async post(url: string, body: any, config?: any) {
    return axios.post(url, body, config);
  }
}