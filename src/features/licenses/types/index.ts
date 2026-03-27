export type LicenseStatus = "active" | "expired" | "blocked";
export type LicensePlan = "trial" | "paid";

export interface License {
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  usage_count: number;
  max_usage: number | null;
  usage_manual: number;
  max_usage_manual: number | null;
  usage_turbo: number;
  max_usage_turbo: number | null;
  usage_agro: number;
  max_usage_agro: number | null;
  fingerprints: string[];
  max_devices: number;
  device_metadata: Record<string, string> | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface LicenseCreate {
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  max_usage?: number | null;
  max_usage_manual?: number | null;
  max_usage_turbo?: number | null;
  max_usage_agro?: number | null;
  max_devices?: number;
  expires_at?: string;
}
