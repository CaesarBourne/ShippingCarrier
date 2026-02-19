export class TokenManager {
  private token?: string;
  private expiresAt?: number;
  private refreshing?: Promise<string>;

  constructor(private fetchToken: () => Promise<any>) {}

  async getToken() {

    if (this.token && Date.now() < this.expiresAt!) {
      return this.token;
    }

    if (this.refreshing) {
      return this.refreshing;
    }

    this.refreshing = this.refresh();

    const token = await this.refreshing;
    this.refreshing = undefined;

    return token;
  }

  private async refresh() {
    const res = await this.fetchToken();

    this.token = res.access_token;
    this.expiresAt =
      Date.now() + res.expires_in * 1000 - 30000;

    return this.token!;
  }
}