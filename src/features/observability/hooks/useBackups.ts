import { useQuery } from "@tanstack/react-query";
import * as backupsService from "@/services/backups.service";

export const backupKeys = {
  tenants: (projectRef: string) => ["backups", projectRef, "tenants"] as const,
  dates: (projectRef: string, tenantCode: string) => ["backups", projectRef, tenantCode, "dates"] as const,
  files: (projectRef: string, tenantCode: string, date: string) => ["backups", projectRef, tenantCode, date] as const,
};

export function useBackupTenants(projectRef: string | null) {
  return useQuery({
    queryKey: backupKeys.tenants(projectRef ?? ""),
    queryFn: () => backupsService.listBackupTenants(projectRef!),
    enabled: !!projectRef,
    staleTime: 60 * 1000,
  });
}

export function useBackupDates(projectRef: string | null, tenantCode: string | null) {
  return useQuery({
    queryKey: backupKeys.dates(projectRef ?? "", tenantCode ?? ""),
    queryFn: () => backupsService.listBackupDates(projectRef!, tenantCode!),
    enabled: !!projectRef && !!tenantCode,
    staleTime: 60 * 1000,
  });
}

export function useBackupFiles(projectRef: string | null, tenantCode: string | null, date: string | null) {
  return useQuery({
    queryKey: backupKeys.files(projectRef ?? "", tenantCode ?? "", date ?? ""),
    queryFn: () => backupsService.listBackupFiles(projectRef!, tenantCode!, date!),
    enabled: !!projectRef && !!tenantCode && !!date,
    staleTime: 60 * 1000,
  });
}
