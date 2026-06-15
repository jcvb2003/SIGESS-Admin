import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAllBillingPlans,
  createBillingPlan,
  updateBillingPlan,
  deleteBillingPlan,
  type BillingPlanInput,
} from "@/features/billing/services/billing.service";

const QUERY_KEY = ["settings", "billing-plans"] as const;

export function useBillingPlans() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: getAllBillingPlans });
}

export function useCreateBillingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BillingPlanInput) => createBillingPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateBillingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<BillingPlanInput> }) =>
      updateBillingPlan(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteBillingPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBillingPlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
