// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { log } from './logger.ts';

export interface BillingProviderConfig {
  provider: string;
  apiKey?: string;
  sandbox: boolean;
  webhookToken?: string;
  source: 'db' | 'env';
}

export async function loadBillingProviderConfig(db: SupabaseClient): Promise<BillingProviderConfig> {
  try {
    const { data, error } = await db
      .from('billing_provider_settings')
      .select('provider, asaas_api_key, asaas_sandbox, asaas_webhook_token')
      .eq('id', 'default')
      .maybeSingle();

    if (!error && data?.provider) {
      return {
        provider: data.provider,
        apiKey: data.asaas_api_key ?? undefined,
        sandbox: data.asaas_sandbox,
        webhookToken: data.asaas_webhook_token ?? undefined,
        source: 'db',
      };
    }
    if (error) log('warn', 'provider-config', 'db read failed — falling back to env', { err: String(error) });
    else       log('warn', 'provider-config', 'no config in db — falling back to env');
  } catch (e) {
    log('warn', 'provider-config', 'db read threw — falling back to env', { err: String(e) });
  }

  // @ts-expect-error: Deno global
  return {
    // @ts-expect-error: Deno global
    provider: Deno.env.get('BILLING_PROVIDER') ?? 'stub',
    // @ts-expect-error: Deno global
    apiKey: Deno.env.get('ASAAS_API_KEY'),
    // @ts-expect-error: Deno global
    sandbox: Deno.env.get('ASAAS_SANDBOX') !== 'false',
    // @ts-expect-error: Deno global
    webhookToken: Deno.env.get('ASAAS_WEBHOOK_TOKEN'),
    source: 'env',
  };
}
