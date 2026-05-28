export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SharedDatabase = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          code: string;
          name: string;
          status: "active" | "inactive" | "suspended";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          status?: "active" | "inactive" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          status?: "active" | "inactive" | "suspended";
          created_at?: string;
          updated_at?: string;
        };
      };
      user_profiles: {
        Row: {
          id: string;
          email: string | null;
          nome: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          nome?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          nome?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      tenant_users: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          tenant_role: "owner" | "manager" | "member";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          tenant_role?: "owner" | "manager" | "member";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          tenant_role?: "owner" | "manager" | "member";
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      tenant_units: {
        Row: {
          id: string;
          tenant_id: string;
          code: string;
          name: string;
          city: string | null;
          state: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          code: string;
          name: string;
          city?: string | null;
          state?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          code?: string;
          name?: string;
          city?: string | null;
          state?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_unit_memberships: {
        Row: {
          id: string;
          user_id: string;
          tenant_id: string;
          unit_id: string | null;
          role:
            | "tenant_admin"
            | "unit_manager"
            | "unit_operator"
            | "unit_viewer";
          is_active: boolean;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tenant_id: string;
          unit_id?: string | null;
          role:
            | "tenant_admin"
            | "unit_manager"
            | "unit_operator"
            | "unit_viewer";
          is_active?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tenant_id?: string;
          unit_id?: string | null;
          role?:
            | "tenant_admin"
            | "unit_manager"
            | "unit_operator"
            | "unit_viewer";
          is_active?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
