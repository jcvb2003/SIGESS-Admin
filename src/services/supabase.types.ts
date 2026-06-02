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
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      export_runs: {
        Row: {
          checksum: string | null
          error_detail: string | null
          executed_at: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          run_id: string
          skip_reason: string | null
          status: string
          tabela: string
          tenant_code: string
          tenant_id: string | null
          tenant_name: string
        }
        Insert: {
          checksum?: string | null
          error_detail?: string | null
          executed_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          run_id: string
          skip_reason?: string | null
          status: string
          tabela: string
          tenant_code: string
          tenant_id?: string | null
          tenant_name: string
        }
        Update: {
          checksum?: string | null
          error_detail?: string | null
          executed_at?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          run_id?: string
          skip_reason?: string | null
          status?: string
          tabela?: string
          tenant_code?: string
          tenant_id?: string | null
          tenant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "projetos"
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
          error_detail: string | null
          id: string
          project_ref: string
          projeto_id: string | null
          status: string | null
          supabase_account_id: string | null
          tenant_code: string | null
          tenant_label: string
          total_steps: number | null
        }
        Insert: {
          admin_email?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error_detail?: string | null
          id?: string
          project_ref: string
          projeto_id?: string | null
          status?: string | null
          supabase_account_id?: string | null
          tenant_code?: string | null
          tenant_label: string
          total_steps?: number | null
        }
        Update: {
          admin_email?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          error_detail?: string | null
          id?: string
          project_ref?: string
          projeto_id?: string | null
          status?: string | null
          supabase_account_id?: string | null
          tenant_code?: string | null
          tenant_label?: string
          total_steps?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_jobs_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
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
      projetos: {
        Row: {
          data_cadastro: string
          health_error_detail: string | null
          id: string
          key_status: string
          last_health_check_at: string | null
          project_name: string
          supabase_access_token: string | null
          supabase_account_id: string | null
          supabase_publishable_key: string
          supabase_secret_keys: string | null
          supabase_url: string
          topology: string
        }
        Insert: {
          data_cadastro?: string
          health_error_detail?: string | null
          id?: string
          key_status?: string
          last_health_check_at?: string | null
          project_name: string
          supabase_access_token?: string | null
          supabase_account_id?: string | null
          supabase_publishable_key: string
          supabase_secret_keys?: string | null
          supabase_url: string
          topology?: string
        }
        Update: {
          data_cadastro?: string
          health_error_detail?: string | null
          id?: string
          key_status?: string
          last_health_check_at?: string | null
          project_name?: string
          supabase_access_token?: string | null
          supabase_account_id?: string | null
          supabase_publishable_key?: string
          supabase_secret_keys?: string | null
          supabase_url?: string
          topology?: string
        }
        Relationships: []
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
            referencedRelation: "projetos"
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
      tenants: {
        Row: {
          acesso_expira_em: string | null
          assinatura: string
          cnpj_cpf: string | null
          created_at: string
          data_cadastro: string
          email: string | null
          id: string
          logo_url: string | null
          max_socios: number
          nome_abreviado: string | null
          nome_entidade: string
          project_id: string
          runtime_tenant_id: string | null
          status: string
          supports_units: boolean
          telefone: string | null
          tenant_code: string
          updated_at: string
        }
        Insert: {
          acesso_expira_em?: string | null
          assinatura?: string
          cnpj_cpf?: string | null
          created_at?: string
          data_cadastro?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          max_socios?: number
          nome_abreviado?: string | null
          nome_entidade: string
          project_id: string
          runtime_tenant_id?: string | null
          status?: string
          supports_units?: boolean
          telefone?: string | null
          tenant_code: string
          updated_at?: string
        }
        Update: {
          acesso_expira_em?: string | null
          assinatura?: string
          cnpj_cpf?: string | null
          created_at?: string
          data_cadastro?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          max_socios?: number
          nome_abreviado?: string | null
          nome_entidade?: string
          project_id?: string
          runtime_tenant_id?: string | null
          status?: string
          supports_units?: boolean
          telefone?: string | null
          tenant_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
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
      tenant_identity_public: {
        Row: {
          logo_url: string | null
          name: string | null
          short_name: string | null
          tenant_code: string | null
        }
        Insert: {
          logo_url?: string | null
          name?: string | null
          short_name?: string | null
          tenant_code?: string | null
        }
        Update: {
          logo_url?: string | null
          name?: string | null
          short_name?: string | null
          tenant_code?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_and_use_license: {
        Args: {
          p_device_name?: string
          p_fingerprint: string
          p_key: string
          p_usage_type?: string
        }
        Returns: Json
      }
      deactivate_device: {
        Args: { p_fingerprint: string; p_key: string }
        Returns: Json
      }
      get_all_backups: {
        Args: never
        Returns: {
          created_at: string
          metadata: Json
          name: string
        }[]
      }
      get_license_status: {
        Args: {
          p_device_name?: string
          p_fingerprint: string
          p_key: string
          p_usage_type?: string
        }
        Returns: Json
      }
      get_tenant_config: { Args: { p_code: string }; Returns: Json }
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

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
