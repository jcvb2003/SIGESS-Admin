export type LicenseStatus = "active" | "expired" | "blocked";
export type LicensePlan = "trial" | "paid";

export interface License {
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  usage_count: number;
  max_usage: number | null;
  usage_manual: number;
  max_manual: number | null;
  usage_turbo: number;
  max_turbo: number | null;
  usage_agro: number;
  max_agro: number | null;
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
  max_manual?: number | null;
  max_turbo?: number | null;
  max_agro?: number | null;
  max_devices?: number;
  expires_at?: string;
}
