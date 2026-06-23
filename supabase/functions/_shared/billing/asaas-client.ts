export class AsaasApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: { code: string; description: string }[],
  ) {
    super(message);
    this.name = 'AsaasApiError';
  }
}

export class AsaasClient {
  readonly baseUrl: string;

  constructor(private readonly apiKey: string, sandbox: boolean) {
    this.baseUrl = sandbox
      ? 'https://api-sandbox.asaas.com/v3'
      : 'https://api.asaas.com/v3';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'access_token': this.apiKey,
    };
  }

  private async parseError(res: Response): Promise<AsaasApiError> {
    let errors: { code: string; description: string }[] = [];
    let message = `Asaas API error ${res.status}`;
    try {
      const body = await res.json() as { errors?: { code: string; description: string }[] };
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        errors = body.errors;
        message = errors.map((e) => e.description).join('; ');
      }
    } catch {
      // ignore parse failure — use default message
    }
    return new AsaasApiError(message, res.status, errors);
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params && Object.keys(params).length > 0) {
      url += '?' + new URLSearchParams(params).toString();
    }
    const res = await fetch(url, { method: 'GET', headers: this.headers() });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<T>;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.parseError(res);
    return res.json() as Promise<T>;
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw await this.parseError(res);
  }
}
