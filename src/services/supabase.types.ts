export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      data_imports: {
        Row: {
          arquivo: string | null
          backup_path: string | null
          created_at: string | null
          erro_detalhe: string | null
          executado_por: string | null
          id: string
          status: string | null
          tabela: string | null
          tenant_id: string | null
          total_registros: number | null
        }
        Insert: {
          arquivo?: string | null
          backup_path?: string | null
          created_at?: string | null
          erro_detalhe?: string | null
          executado_por?: string | null
          id?: string
          status?: string | null
          tabela?: string | null
          tenant_id?: string | null
          total_registros?: number | null
        }
        Update: {
          arquivo?: string | null
          backup_path?: string | null
          created_at?: string | null
          erro_detalhe?: string | null
          executado_por?: string | null
          id?: string
          status?: string | null
          tabela?: string | null
          tenant_id?: string | null
          total_registros?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_audits: {
        Row: {
          current_version: number | null
          function_slug: string
          id: string
          last_checked_at: string | null
          reference_version: number | null
          status: string | null
          tenant_id: string | null
          verify_jwt_current: boolean | null
          verify_jwt_reference: boolean | null
        }
        Insert: {
          current_version?: number | null
          function_slug: string
          id?: string
          last_checked_at?: string | null
          reference_version?: number | null
          status?: string | null
          tenant_id?: string | null
          verify_jwt_current?: boolean | null
          verify_jwt_reference?: boolean | null
        }
        Update: {
          current_version?: number | null
          function_slug?: string
          id?: string
          last_checked_at?: string | null
          reference_version?: number | null
          status?: string | null
          tenant_id?: string | null
          verify_jwt_current?: boolean | null
          verify_jwt_reference?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "edge_function_audits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
        ]
      }
      entidades: {
        Row: {
          acesso_expira_em: string | null
          assinatura: string
          data_cadastro: string
          email: string | null
          health_error_detail: string | null
          id: string
          key_status: string | null
          last_health_check_at: string | null
          logo_url: string | null
          max_socios: number | null
          nome_entidade: string
          supabase_access_token: string | null
          supabase_publishable_key: string
          supabase_secret_keys: string | null
          supabase_url: string
          telefone: string | null
          tenant_code: string
        }
        Insert: {
          acesso_expira_em?: string | null
          assinatura?: string
          data_cadastro?: string
          email?: string | null
          health_error_detail?: string | null
          id?: string
          key_status?: string | null
          last_health_check_at?: string | null
          logo_url?: string | null
          max_socios?: number | null
          nome_entidade: string
          supabase_access_token?: string | null
          supabase_publishable_key: string
          supabase_secret_keys?: string | null
          supabase_url: string
          telefone?: string | null
          tenant_code: string
        }
        Update: {
          acesso_expira_em?: string | null
          assinatura?: string
          data_cadastro?: string
          email?: string | null
          health_error_detail?: string | null
          id?: string
          key_status?: string | null
          last_health_check_at?: string | null
          logo_url?: string | null
          max_socios?: number | null
          nome_entidade?: string
          supabase_access_token?: string | null
          supabase_publishable_key?: string
          supabase_secret_keys?: string | null
          supabase_url?: string
          telefone?: string | null
          tenant_code?: string
        }
        Relationships: []
      }
      export_runs: {
        Row: {
          checksum: string | null
          error_detail: string | null
          executed_at: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          run_id: string | null
          skip_reason: string | null
          status: string | null
          tabela: string | null
          tenant_code: string | null
          tenant_id: string | null
          tenant_name: string | null
        }
        Insert: {
          checksum?: string | null
          error_detail?: string | null
          executed_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          run_id?: string | null
          skip_reason?: string | null
          status?: string | null
          tabela?: string | null
          tenant_code?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
        }
        Update: {
          checksum?: string | null
          error_detail?: string | null
          executed_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          run_id?: string | null
          skip_reason?: string | null
          status?: string | null
          tabela?: string | null
          tenant_code?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string | null
          customer_name: string | null
          device_metadata: Json | null
          expires_at: string | null
          fingerprints: string[]
          key: string
          max_agro: number | null
          max_devices: number | null
          max_manual: number | null
          max_turbo: number | null
          max_usage: number | null
          plan: string
          status: string
          updated_at: string | null
          usage_agro: number | null
          usage_count: number
          usage_manual: number | null
          usage_turbo: number | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          device_metadata?: Json | null
          expires_at?: string | null
          fingerprints?: string[]
          key: string
          max_agro?: number | null
          max_devices?: number | null
          max_manual?: number | null
          max_turbo?: number | null
          max_usage?: number | null
          plan?: string
          status?: string
          updated_at?: string | null
          usage_agro?: number | null
          usage_count?: number
          usage_manual?: number | null
          usage_turbo?: number | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          device_metadata?: Json | null
          expires_at?: string | null
          fingerprints?: string[]
          key?: string
          max_agro?: number | null
          max_devices?: number | null
          max_manual?: number | null
          max_turbo?: number | null
          max_usage?: number | null
          plan?: string
          status?: string
          updated_at?: string | null
          usage_agro?: number | null
          usage_count?: number
          usage_manual?: number | null
          usage_turbo?: number | null
        }
        Relationships: []
      }
      onboarding_jobs: {
        Row: {
          admin_email: string | null
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          entidade_id: string | null
          error_detail: string | null
          id: string
          project_ref: string
          status: string | null
          supabase_account_id: string | null
          tenant_code: string
          tenant_label: string
          total_steps: number | null
        }
        Insert: {
          admin_email?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          entidade_id?: string | null
          error_detail?: string | null
          id?: string
          project_ref: string
          status?: string | null
          supabase_account_id?: string | null
          tenant_code: string
          tenant_label: string
          total_steps?: number | null
        }
        Update: {
          admin_email?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          entidade_id?: string | null
          error_detail?: string | null
          id?: string
          project_ref?: string
          status?: string | null
          supabase_account_id?: string | null
          tenant_code?: string
          tenant_label?: string
          total_steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_jobs_entidade_id_fkey"
            columns: ["entidade_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_jobs_supabase_account_id_fkey"
            columns: ["supabase_account_id"]
            isOneToOne: false
            referencedRelation: "supabase_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_jobs_supabase_account_id_fkey"
            columns: ["supabase_account_id"]
            isOneToOne: false
            referencedRelation: "supabase_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          checksum: string | null
          error_detail: string | null
          id: string
          migration_name: string
          statements: string | null
          status: string | null
          tenant_id: string | null
          version: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          checksum?: string | null
          error_detail?: string | null
          id?: string
          migration_name: string
          statements?: string | null
          status?: string | null
          tenant_id?: string | null
          version?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          checksum?: string | null
          error_detail?: string | null
          id?: string
          migration_name?: string
          statements?: string | null
          status?: string | null
          tenant_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schema_migrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_sync_status: {
        Row: {
          checked_at: string | null
          diffs: Json | null
          id: string
          summary: Json | null
          tenant_id: string | null
          total_diffs: number | null
        }
        Insert: {
          checked_at?: string | null
          diffs?: Json | null
          id?: string
          summary?: Json | null
          tenant_id?: string | null
          total_diffs?: number | null
        }
        Update: {
          checked_at?: string | null
          diffs?: Json | null
          id?: string
          summary?: Json | null
          tenant_id?: string | null
          total_diffs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "schema_sync_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "entidades"
            referencedColumns: ["id"]
          },
        ]
      }
      supabase_accounts: {
        Row: {
          active_projects: number | null
          created_at: string | null
          id: string
          label: string
          management_token: string
          max_projects: number | null
        }
        Insert: {
          active_projects?: number | null
          created_at?: string | null
          id?: string
          label: string
          management_token: string
          max_projects?: number | null
        }
        Update: {
          active_projects?: number | null
          created_at?: string | null
          id?: string
          label?: string
          management_token?: string
          max_projects?: number | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          is_secret: boolean | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          is_secret?: boolean | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          is_secret?: boolean | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          created_at: string | null
          description: string | null
          file_path: string
          file_url: string
          font_data: Json | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_path: string
          file_url: string
          font_data?: Json | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_path?: string
          file_url?: string
          font_data?: Json | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      supabase_accounts_safe: {
        Row: {
          active_projects: number | null
          created_at: string | null
          id: string | null
          label: string | null
          management_token_masked: string | null
          max_projects: number | null
        }
        Insert: {
          active_projects?: number | null
          created_at?: string | null
          id?: string | null
          label?: string | null
          management_token_masked?: never
          max_projects?: number | null
        }
        Update: {
          active_projects?: number | null
          created_at?: string | null
          id?: string | null
          label?: string | null
          management_token_masked?: never
          max_projects?: number | null
        }
        Relationships: []
      }
      system_settings_safe: {
        Row: {
          is_secret: boolean | null
          key: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          is_secret?: boolean | null
          key?: string | null
          updated_at?: string | null
          value?: never
        }
        Update: {
          is_secret?: boolean | null
          key?: string | null
          updated_at?: string | null
          value?: never
        }
        Relationships: []
      }
    }
    Functions: {
      check_and_use_license: {
        Args: { p_fingerprint: string; p_key: string; p_usage_type?: string }
        Returns: Json
      }
      get_license_status: {
        Args: { p_fingerprint: string; p_key: string; p_usage_type?: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_active_projects: {
        Args: { account_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type PublicSchema = DatabaseWithoutInternals[Extract<keyof DatabaseWithoutInternals, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
