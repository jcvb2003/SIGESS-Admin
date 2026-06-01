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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log_financeiro: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string
          table_name: string
          tenant_id: string | null
          unit_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id: string
          table_name: string
          tenant_id?: string | null
          unit_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
          tenant_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_financeiro_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_financeiro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_financeiro_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao_entidade: {
        Row: {
          cor_primaria: string
          cor_secundaria: string
          cor_sidebar: string
          created_at: string | null
          extensao_license_key: string | null
          id: number
          logo_path: string | null
          tenant_id: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          cor_primaria?: string
          cor_secundaria?: string
          cor_sidebar?: string
          created_at?: string | null
          extensao_license_key?: string | null
          id?: number
          logo_path?: string | null
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          cor_primaria?: string
          cor_secundaria?: string
          cor_sidebar?: string
          created_at?: string | null
          extensao_license_key?: string | null
          id?: number
          logo_path?: string | null
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_entidade_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      entidade: {
        Row: {
          bairro: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          comarca: string | null
          confederacao: string | null
          cpf_do_presidente: string | null
          email: string | null
          endereco: string | null
          federacao: string | null
          fone: string | null
          fundacao: string | null
          id: string
          nome_abreviado: string | null
          nome_do_presidente: string | null
          nome_entidade: string | null
          numero: string | null
          polo: string | null
          tenant_id: string | null
          uf: string | null
          unit_id: string | null
        }
        Insert: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          comarca?: string | null
          confederacao?: string | null
          cpf_do_presidente?: string | null
          email?: string | null
          endereco?: string | null
          federacao?: string | null
          fone?: string | null
          fundacao?: string | null
          id?: string
          nome_abreviado?: string | null
          nome_do_presidente?: string | null
          nome_entidade?: string | null
          numero?: string | null
          polo?: string | null
          tenant_id?: string | null
          uf?: string | null
          unit_id?: string | null
        }
        Update: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          comarca?: string | null
          confederacao?: string | null
          cpf_do_presidente?: string | null
          email?: string | null
          endereco?: string | null
          federacao?: string | null
          fone?: string | null
          fundacao?: string | null
          id?: string
          nome_abreviado?: string | null
          nome_do_presidente?: string | null
          nome_entidade?: string | null
          numero?: string | null
          polo?: string | null
          tenant_id?: string | null
          uf?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entidade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entidade_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_cobrancas_geradas: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cancelamento_obs: string | null
          created_at: string | null
          data_lancamento: string
          data_vencimento: string | null
          id: string
          lancamento_id: string | null
          socio_cpf: string
          status: string
          tipo_cobranca_id: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_obs?: string | null
          created_at?: string | null
          data_lancamento?: string
          data_vencimento?: string | null
          id?: string
          lancamento_id?: string | null
          socio_cpf: string
          status?: string
          tipo_cobranca_id: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_obs?: string | null
          created_at?: string | null
          data_lancamento?: string
          data_vencimento?: string | null
          id?: string
          lancamento_id?: string | null
          socio_cpf?: string
          status?: string
          tipo_cobranca_id?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_cobrancas_geradas_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_cobrancas_geradas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_cobrancas_geradas_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_cobrancas_geradas_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_cobrancas_geradas_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_cobrancas_geradas_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_cobrancas_geradas_tipo_cobranca_id_fkey"
            columns: ["tipo_cobranca_id"]
            isOneToOne: false
            referencedRelation: "tipos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_config_socio: {
        Row: {
          cpf: string
          created_at: string | null
          dia_vencimento: number | null
          isento: boolean
          liberacao_data: string | null
          liberacao_observacao: string | null
          liberacao_usuario_id: string | null
          liberado_pelo_presidente: boolean
          motivo_isencao: string | null
          referencia_vencimento: string | null
          regime: string | null
          socio_historico: boolean
          updated_at: string | null
        }
        Insert: {
          cpf: string
          created_at?: string | null
          dia_vencimento?: number | null
          isento?: boolean
          liberacao_data?: string | null
          liberacao_observacao?: string | null
          liberacao_usuario_id?: string | null
          liberado_pelo_presidente?: boolean
          motivo_isencao?: string | null
          referencia_vencimento?: string | null
          regime?: string | null
          socio_historico?: boolean
          updated_at?: string | null
        }
        Update: {
          cpf?: string
          created_at?: string | null
          dia_vencimento?: number | null
          isento?: boolean
          liberacao_data?: string | null
          liberacao_observacao?: string | null
          liberacao_usuario_id?: string | null
          liberado_pelo_presidente?: boolean
          motivo_isencao?: string | null
          referencia_vencimento?: string | null
          regime?: string | null
          socio_historico?: boolean
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_config_socio_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_config_socio_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_config_socio_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_config_socio_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_config_socio_liberacao_usuario_id_fkey"
            columns: ["liberacao_usuario_id"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_dae: {
        Row: {
          boleto_pago: boolean
          cancelado_em: string | null
          cancelado_por: string | null
          cancelamento_obs: string | null
          competencia_ano: number
          competencia_mes: number
          created_at: string | null
          data_pagamento_boleto: string | null
          data_recebimento: string
          forma_pagamento: string
          grupo_id: string | null
          id: string
          registrado_por: string | null
          sessao_id: string | null
          socio_cpf: string
          status: string
          tipo_boleto: string
          updated_at: string | null
          valor: number
        }
        Insert: {
          boleto_pago?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_obs?: string | null
          competencia_ano: number
          competencia_mes: number
          created_at?: string | null
          data_pagamento_boleto?: string | null
          data_recebimento?: string
          forma_pagamento: string
          grupo_id?: string | null
          id?: string
          registrado_por?: string | null
          sessao_id?: string | null
          socio_cpf: string
          status?: string
          tipo_boleto: string
          updated_at?: string | null
          valor: number
        }
        Update: {
          boleto_pago?: boolean
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_obs?: string | null
          competencia_ano?: number
          competencia_mes?: number
          created_at?: string | null
          data_pagamento_boleto?: string | null
          data_recebimento?: string
          forma_pagamento?: string
          grupo_id?: string | null
          id?: string
          registrado_por?: string | null
          sessao_id?: string | null
          socio_cpf?: string
          status?: string
          tipo_boleto?: string
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_dae_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_dae_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_dae_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_dae_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_dae_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_dae_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
        ]
      }
      financeiro_historico_regime: {
        Row: {
          alterado_por: string | null
          created_at: string | null
          id: string
          observacao: string | null
          regime: string
          socio_cpf: string
          vigente_ate: string | null
          vigente_desde: string
        }
        Insert: {
          alterado_por?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          regime: string
          socio_cpf: string
          vigente_ate?: string | null
          vigente_desde: string
        }
        Update: {
          alterado_por?: string | null
          created_at?: string | null
          id?: string
          observacao?: string | null
          regime?: string
          socio_cpf?: string
          vigente_ate?: string | null
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_historico_regime_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_historico_regime_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_historico_regime_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_historico_regime_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_historico_regime_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
        ]
      }
      financeiro_lancamentos: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cancelamento_obs: string | null
          competencia_ano: number | null
          competencia_mes: number | null
          created_at: string | null
          data_pagamento: string
          descricao: string | null
          forma_pagamento: string
          id: string
          registrado_por: string | null
          sessao_id: string
          socio_cpf: string
          status: string
          tipo: string
          tipo_cobranca_id: string | null
          updated_at: string | null
          valor: number
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_obs?: string | null
          competencia_ano?: number | null
          competencia_mes?: number | null
          created_at?: string | null
          data_pagamento?: string
          descricao?: string | null
          forma_pagamento: string
          id?: string
          registrado_por?: string | null
          sessao_id?: string
          socio_cpf: string
          status?: string
          tipo: string
          tipo_cobranca_id?: string | null
          updated_at?: string | null
          valor: number
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_obs?: string | null
          competencia_ano?: number | null
          competencia_mes?: number | null
          created_at?: string | null
          data_pagamento?: string
          descricao?: string | null
          forma_pagamento?: string
          id?: string
          registrado_por?: string | null
          sessao_id?: string
          socio_cpf?: string
          status?: string
          tipo?: string
          tipo_cobranca_id?: string | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_lancamentos_cancelado_por_fkey"
            columns: ["cancelado_por"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_socio_cpf_fkey"
            columns: ["socio_cpf"]
            isOneToOne: false
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "financeiro_lancamentos_tipo_cobranca_id_fkey"
            columns: ["tipo_cobranca_id"]
            isOneToOne: false
            referencedRelation: "tipos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      foto_upload_tokens: {
        Row: {
          created_at: string
          expires_at: string
          foto_base64: string | null
          foto_url: string | null
          socio_cpf: string | null
          token: string
          updated_at: string | null
          used: boolean
        }
        Insert: {
          created_at?: string
          expires_at?: string
          foto_base64?: string | null
          foto_url?: string | null
          socio_cpf?: string | null
          token?: string
          updated_at?: string | null
          used?: boolean
        }
        Update: {
          created_at?: string
          expires_at?: string
          foto_base64?: string | null
          foto_url?: string | null
          socio_cpf?: string | null
          token?: string
          updated_at?: string | null
          used?: boolean
        }
        Relationships: []
      }
      localidades: {
        Row: {
          codigo_localidade: string | null
          id: string
          nome: string | null
          tenant_id: string | null
          unit_id: string | null
        }
        Insert: {
          codigo_localidade?: string | null
          id?: string
          nome?: string | null
          tenant_id?: string | null
          unit_id?: string | null
        }
        Update: {
          codigo_localidade?: string | null
          id?: string
          nome?: string | null
          tenant_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "localidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localidades_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_eventos_requerimento: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          requerimento_id: string | null
          tipo_evento: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          requerimento_id?: string | null
          tipo_evento?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          requerimento_id?: string | null
          tipo_evento?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_eventos_requerimento_requerimento_id_fkey"
            columns: ["requerimento_id"]
            isOneToOne: false
            referencedRelation: "requerimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_eventos_requerimento_requerimento_id_fkey"
            columns: ["requerimento_id"]
            isOneToOne: false
            referencedRelation: "v_requerimentos_busca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_eventos_requerimento_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "User"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          data_publicacao: string | null
          especies_proibidas: string | null
          final_pesca1: string | null
          final_pesca2: string | null
          id: string
          inicio_pesca1: string | null
          inicio_pesca2: string | null
          local_pesca: string | null
          localpesca: string | null
          nr_publicacao: string | null
          tenant_id: string | null
          unit_id: string | null
        }
        Insert: {
          data_publicacao?: string | null
          especies_proibidas?: string | null
          final_pesca1?: string | null
          final_pesca2?: string | null
          id?: string
          inicio_pesca1?: string | null
          inicio_pesca2?: string | null
          local_pesca?: string | null
          localpesca?: string | null
          nr_publicacao?: string | null
          tenant_id?: string | null
          unit_id?: string | null
        }
        Update: {
          data_publicacao?: string | null
          especies_proibidas?: string | null
          final_pesca1?: string | null
          final_pesca2?: string | null
          id?: string
          inicio_pesca1?: string | null
          inicio_pesca2?: string | null
          local_pesca?: string | null
          localpesca?: string | null
          nr_publicacao?: string | null
          tenant_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parametros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametros_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_financeiros: {
        Row: {
          ano_base_cobranca: number | null
          anos_atraso_alerta: number | null
          bloquear_inadimplente: boolean | null
          cobra_juros: boolean | null
          cobra_multa: boolean | null
          created_at: string | null
          dia_vencimento: number | null
          id: string
          percentual_juros_mes: number | null
          percentual_multa: number | null
          regime_padrao: string | null
          tenant_id: string | null
          unit_id: string | null
          updated_at: string | null
          valor_anuidade: number | null
          valor_inscricao: number | null
          valor_mensalidade: number | null
          valor_transferencia: number | null
        }
        Insert: {
          ano_base_cobranca?: number | null
          anos_atraso_alerta?: number | null
          bloquear_inadimplente?: boolean | null
          cobra_juros?: boolean | null
          cobra_multa?: boolean | null
          created_at?: string | null
          dia_vencimento?: number | null
          id?: string
          percentual_juros_mes?: number | null
          percentual_multa?: number | null
          regime_padrao?: string | null
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
          valor_anuidade?: number | null
          valor_inscricao?: number | null
          valor_mensalidade?: number | null
          valor_transferencia?: number | null
        }
        Update: {
          ano_base_cobranca?: number | null
          anos_atraso_alerta?: number | null
          bloquear_inadimplente?: boolean | null
          cobra_juros?: boolean | null
          cobra_multa?: boolean | null
          created_at?: string | null
          dia_vencimento?: number | null
          id?: string
          percentual_juros_mes?: number | null
          percentual_multa?: number | null
          regime_padrao?: string | null
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
          valor_anuidade?: number | null
          valor_inscricao?: number | null
          valor_mensalidade?: number | null
          valor_transferencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parametros_financeiros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametros_financeiros_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      reap: {
        Row: {
          anual: Json
          cpf: string
          observacoes: string | null
          simplificado: Json
          updated_at: string
        }
        Insert: {
          anual?: Json
          cpf: string
          observacoes?: string | null
          simplificado?: Json
          updated_at?: string
        }
        Update: {
          anual?: Json
          cpf?: string
          observacoes?: string | null
          simplificado?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reap_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "reap_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "reap_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "reap_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: true
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
        ]
      }
      requerimentos: {
        Row: {
          ano_referencia: number
          beneficio_recebido: boolean
          cod_req: string | null
          cpf: string | null
          created_at: string | null
          data_assinatura: string | null
          data_envio: string | null
          id: string
          num_req_mte: string | null
          status_mte: string
          updated_at: string | null
        }
        Insert: {
          ano_referencia: number
          beneficio_recebido?: boolean
          cod_req?: string | null
          cpf?: string | null
          created_at?: string | null
          data_assinatura?: string | null
          data_envio?: string | null
          id?: string
          num_req_mte?: string | null
          status_mte?: string
          updated_at?: string | null
        }
        Update: {
          ano_referencia?: number
          beneficio_recebido?: boolean
          cod_req?: string | null
          cpf?: string | null
          created_at?: string | null
          data_assinatura?: string | null
          data_envio?: string | null
          id?: string
          num_req_mte?: string | null
          status_mte?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
        ]
      }
      socios: {
        Row: {
          alfabetizado: string | null
          apelido: string | null
          bairro: string | null
          caepf: string | null
          cei: string | null
          cep: string | null
          cidade: string | null
          codigo_do_socio: string | null
          codigo_localidade: string | null
          cpf: string
          created_at: string | null
          data_de_admissao: string | null
          data_de_nascimento: string | null
          dt_expedicao_rg: string | null
          email: string | null
          emissao_rgp: string | null
          endereco: string | null
          escolaridade: string | null
          estado_civil: string | null
          id: string
          mae: string | null
          nacionalidade: string | null
          naturalidade: string | null
          nit: string | null
          nome: string | null
          num: string | null
          num_rgp: string | null
          observacoes: string | null
          pai: string | null
          rg: string | null
          rgp_uf: string | null
          secao: string | null
          senhagov_inss: string | null
          sexo: string | null
          situacao: string | null
          telefone: string | null
          tenant_id: string | null
          tipo_rgp: string | null
          titulo: string | null
          uf: string | null
          uf_naturalidade: string | null
          uf_rg: string | null
          unit_id: string | null
          updated_at: string | null
          zona: string | null
        }
        Insert: {
          alfabetizado?: string | null
          apelido?: string | null
          bairro?: string | null
          caepf?: string | null
          cei?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_do_socio?: string | null
          codigo_localidade?: string | null
          cpf: string
          created_at?: string | null
          data_de_admissao?: string | null
          data_de_nascimento?: string | null
          dt_expedicao_rg?: string | null
          email?: string | null
          emissao_rgp?: string | null
          endereco?: string | null
          escolaridade?: string | null
          estado_civil?: string | null
          id?: string
          mae?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nit?: string | null
          nome?: string | null
          num?: string | null
          num_rgp?: string | null
          observacoes?: string | null
          pai?: string | null
          rg?: string | null
          rgp_uf?: string | null
          secao?: string | null
          senhagov_inss?: string | null
          sexo?: string | null
          situacao?: string | null
          telefone?: string | null
          tenant_id?: string | null
          tipo_rgp?: string | null
          titulo?: string | null
          uf?: string | null
          uf_naturalidade?: string | null
          uf_rg?: string | null
          unit_id?: string | null
          updated_at?: string | null
          zona?: string | null
        }
        Update: {
          alfabetizado?: string | null
          apelido?: string | null
          bairro?: string | null
          caepf?: string | null
          cei?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_do_socio?: string | null
          codigo_localidade?: string | null
          cpf?: string
          created_at?: string | null
          data_de_admissao?: string | null
          data_de_nascimento?: string | null
          dt_expedicao_rg?: string | null
          email?: string | null
          emissao_rgp?: string | null
          endereco?: string | null
          escolaridade?: string | null
          estado_civil?: string | null
          id?: string
          mae?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nit?: string | null
          nome?: string | null
          num?: string | null
          num_rgp?: string | null
          observacoes?: string | null
          pai?: string | null
          rg?: string | null
          rgp_uf?: string | null
          secao?: string | null
          senhagov_inss?: string | null
          sexo?: string | null
          situacao?: string | null
          telefone?: string | null
          tenant_id?: string | null
          tipo_rgp?: string | null
          titulo?: string | null
          uf?: string | null
          uf_naturalidade?: string | null
          uf_rg?: string | null
          unit_id?: string | null
          updated_at?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "socios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "socios_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          content_type: string | null
          created_at: string | null
          document_type: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          font_configurations: string | null
          id: string
          name: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          document_type?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          font_configurations?: string | null
          id?: string
          name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          document_type?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          font_configurations?: string | null
          id?: string
          name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_units: {
        Row: {
          city: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          state: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          state?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          state?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          operator_type: string | null
          tenant_id: string
          tenant_role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          operator_type?: string | null
          tenant_id: string
          tenant_role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          operator_type?: string | null
          tenant_id?: string
          tenant_role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_cobranca: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          obrigatoriedade: string | null
          tenant_id: string | null
          unit_id: string | null
          updated_at: string | null
          valor_padrao: number | null
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          obrigatoriedade?: string | null
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
          valor_padrao?: number | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          obrigatoriedade?: string | null
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
          valor_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_cobranca_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipos_cobranca_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      User: {
        Row: {
          ativo: boolean
          createdAt: string | null
          email: string | null
          id: string
          nome: string | null
          role: string | null
        }
        Insert: {
          ativo?: boolean
          createdAt?: string | null
          email?: string | null
          id: string
          nome?: string | null
          role?: string | null
        }
        Update: {
          ativo?: boolean
          createdAt?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          role?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_active?: boolean
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_unit_memberships: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          tenant_id: string
          unit_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id: string
          unit_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          unit_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unit_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unit_memberships_tenant_unit_fk"
            columns: ["tenant_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "user_unit_memberships_tenant_user_fk"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tenant_users"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
    }
    Views: {
      reap_list_view: {
        Row: {
          anual: Json | null
          cpf: string | null
          emissao_rgp: string | null
          nit: string | null
          nome: string | null
          observacoes: string | null
          reap_status: string | null
          simplificado: Json | null
          situacao: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "socios_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
      v_debitos_socio: {
        Row: {
          ano: number | null
          anuidade_pendente: boolean | null
          cpf: string | null
          isento: boolean | null
          liberado: boolean | null
          nome: string | null
        }
        Relationships: []
      }
      v_requerimentos_busca: {
        Row: {
          ano_referencia: number | null
          beneficio_recebido: boolean | null
          cod_req: string | null
          cpf: string | null
          created_at: string | null
          data_assinatura: string | null
          data_envio: string | null
          emissao_rgp: string | null
          id: string | null
          num_req_mte: string | null
          socio_nit: string | null
          socio_nome: string | null
          status_mte: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "reap_list_view"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "v_debitos_socio"
            referencedColumns: ["cpf"]
          },
          {
            foreignKeyName: "requerimentos_cpf_fkey"
            columns: ["cpf"]
            isOneToOne: false
            referencedRelation: "v_situacao_financeira_socio"
            referencedColumns: ["cpf"]
          },
        ]
      }
      v_situacao_financeira_socio: {
        Row: {
          anuidades_pagas: number[] | null
          cpf: string | null
          isento: boolean | null
          liberado_presidente: boolean | null
          meses_pagos_atual: number[] | null
          nome: string | null
          regime: string | null
          situacao_associativa: string | null
          situacao_geral: string | null
          ultimo_pagamento: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "socios_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tenant_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cancel_payment_v1: {
        Args: { p_id: string; p_obs?: string }
        Returns: undefined
      }
      confirmar_upload_foto: {
        Args: { p_base64: string; p_token: string }
        Returns: boolean
      }
      get_birthday_members: {
        Args: { p_day: number; p_month: number; p_unit_id?: string }
        Returns: {
          cpf: string
          data_de_nascimento: string
          id: string
          nome: string
        }[]
      }
      get_finance_audit_log_v1: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_operation?: string
          p_table_name?: string
        }
        Returns: {
          changed_by: string
          created_at: string
          id: string
          new_data: Json
          old_data: Json
          operation: string
          record_id: string
          table_name: string
          user_email: string
          user_nome: string
        }[]
      }
      get_finance_tab_counts:
        | {
            Args: {
              p_ano_base?: number
              p_search_term?: string
              p_year?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_ano_base?: number
              p_search_term?: string
              p_unit_id?: string
              p_year?: number
            }
            Returns: Json
          }
      get_members_by_birth_month: {
        Args: { p_limit?: number; p_month: number; p_offset?: number }
        Returns: {
          codigo_do_socio: string
          cpf: string
          data_de_nascimento: string
          id: string
          nome: string
          total_count: number
        }[]
      }
      get_next_cod_req: { Args: never; Returns: string }
      get_payments_by_period_paginated:
        | {
            Args: {
              p_end_date: string
              p_limit?: number
              p_offset?: number
              p_order_by?: string
              p_order_dir?: string
              p_start_date: string
            }
            Returns: {
              competencia_ano: number
              competencia_mes: number
              created_at: string
              data_pagamento: string
              forma_pagamento: string
              id: string
              socio_cpf: string
              socio_nome: string
              tipo: string
              total_amount: number
              total_count: number
              valor: number
            }[]
          }
        | {
            Args: {
              p_end_date: string
              p_limit?: number
              p_offset?: number
              p_order_by?: string
              p_order_dir?: string
              p_start_date: string
              p_unit_id?: string
            }
            Returns: {
              competencia_ano: number
              competencia_mes: number
              created_at: string
              data_pagamento: string
              forma_pagamento: string
              id: string
              socio_cpf: string
              socio_nome: string
              tipo: string
              total_amount: number
              total_count: number
              valor: number
            }[]
          }
      get_socio_financial_status: {
        Args: {
          p_cpf: string
          p_isento: boolean
          p_liberado: boolean
          p_regime: string
        }
        Returns: string
      }
      get_unit_stats: {
        Args: never
        Returns: {
          pending_req_count: number
          socios_count: number
          unit_id: string
        }[]
      }
      is_tenant_owner: { Args: { p_tenant_id: string }; Returns: boolean }
      launch_bulk_contribution: {
        Args: { p_tipo_cobranca_id: string; p_unit_id?: string }
        Returns: number
      }
      list_requirements_extended:
        | {
            Args: {
              p_ano: number
              p_beneficio?: string
              p_carencia?: string
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_status?: string
            }
            Returns: {
              ano_referencia: number
              beneficio_recebido: boolean
              cod_req: string
              cpf: string
              created_at: string
              data_assinatura: string
              data_envio: string
              id: string
              num_req_mte: string
              socio_emissao_rgp: string
              socio_id: string
              socio_nit: string
              socio_nome: string
              socio_num_rgp: string
              status_mte: string
              total_count: number
              updated_at: string
            }[]
          }
        | {
            Args: {
              p_ano: number
              p_beneficio?: string
              p_carencia?: string
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_status?: string
              p_unit_id?: string
            }
            Returns: {
              ano_referencia: number
              beneficio_recebido: boolean
              cod_req: string
              cpf: string
              created_at: string
              data_assinatura: string
              data_envio: string
              id: string
              num_req_mte: string
              socio_emissao_rgp: string
              socio_id: string
              socio_nit: string
              socio_nome: string
              socio_num_rgp: string
              status_mte: string
              total_count: number
              updated_at: string
            }[]
          }
      process_data_import: {
        Args: { p_data: Json; p_table_name: string }
        Returns: Json
      }
      purge_cancelled_bulk_v1: {
        Args: { p_older_than_days: number }
        Returns: number
      }
      purge_payment_v1: { Args: { p_id: string }; Returns: undefined }
      reap_batch_upsert_anual_v2: {
        Args: { p_entries: Json }
        Returns: undefined
      }
      reap_batch_upsert_simplificado: {
        Args: { p_entries: Json }
        Returns: undefined
      }
      reap_batch_upsert_simplificado_v2: {
        Args: { p_entries: Json }
        Returns: undefined
      }
      reap_upsert_anual_ano: {
        Args: { p_ano: string; p_cpf: string; p_data: Json }
        Returns: undefined
      }
      reap_upsert_full: {
        Args: {
          p_anual: Json
          p_cpf: string
          p_observacoes?: string
          p_simplificado: Json
        }
        Returns: undefined
      }
      reap_upsert_simplificado_ano: {
        Args: { p_ano: string; p_cpf: string; p_data: Json }
        Returns: undefined
      }
      register_payment_session: {
        Args: {
          p_daes?: Json
          p_data_pagamento: string
          p_forma_pagamento: string
          p_itens: Json
          p_sessao_id: string
          p_socio_cpf: string
        }
        Returns: undefined
      }
      socio_inadimplente_ano: {
        Args: { p_ano: number; p_cpf: string }
        Returns: boolean
      }
      update_dae_group: {
        Args: { p_grupo_id: string; p_items: Json; p_new_year: number }
        Returns: undefined
      }
      update_extension_license: {
        Args: { p_key: string; p_unit_id?: string }
        Returns: undefined
      }
      update_member_regime: {
        Args: { p_cpf: string; p_novo_regime: string; p_observacao?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
