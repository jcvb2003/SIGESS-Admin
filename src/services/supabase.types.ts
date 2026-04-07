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
      entidades: {
        Row: {
          acesso_expira_em: string | null
          assinatura: string
          data_cadastro: string
          email: string | null
          id: string
          logo_url: string | null
          max_socios: number | null
          nome_entidade: string
          supabase_access_token: string | null
          supabase_publishable_key: string | null
          supabase_secret_keys: string | null
          supabase_url: string
          telefone: string | null
          tenant_code: string | null
        }
        Insert: {
          acesso_expira_em?: string | null
          assinatura?: string
          data_cadastro?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          max_socios?: number | null
          nome_entidade: string
          supabase_access_token?: string | null
          supabase_publishable_key?: string | null
          supabase_secret_keys?: string | null
          supabase_url: string
          telefone?: string | null
          tenant_code?: string | null
        }
        Update: {
          acesso_expira_em?: string | null
          assinatura?: string
          data_cadastro?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          max_socios?: number | null
          nome_entidade?: string
          supabase_access_token?: string | null
          supabase_publishable_key?: string | null
          supabase_secret_keys?: string | null
          supabase_url?: string
          telefone?: string | null
          tenant_code?: string | null
        }
        Relationships: []
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
          error_detail: string | null
          id: string
          migration_name: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          error_detail?: string | null
          id?: string
          migration_name: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          error_detail?: string | null
          id?: string
          migration_name?: string
          status?: string | null
          tenant_id?: string | null
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
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
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
