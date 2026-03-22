export type LicenseStatus = "active" | "expired" | "blocked";
export type LicensePlan = "trial" | "paid";

export interface License {
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  usage_count: number;
  max_usage: number | null;
  fingerprint: string | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface LicenseCreate {
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  max_usage?: number;
  expires_at?: string;
}
