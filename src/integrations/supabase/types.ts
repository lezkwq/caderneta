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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_estado: {
        Row: {
          bloqueado_ate: string | null
          chave: string
          ultima_consulta: string | null
        }
        Insert: {
          bloqueado_ate?: string | null
          chave: string
          ultima_consulta?: string | null
        }
        Update: {
          bloqueado_ate?: string | null
          chave?: string
          ultima_consulta?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          chave: string
          descricao: string | null
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          valor?: Json
        }
        Relationships: []
      }
      buscas: {
        Row: {
          apify_dataset_id: string | null
          apify_run_id: string | null
          cidade: string | null
          created_at: string
          erro: string | null
          estado: string | null
          id: string
          nicho: string | null
          pais: string | null
          quantidade: number | null
          status: string
          tipo: string
          titulo: string
          total_leads: number
          updated_at: string
          user_id: string
        }
        Insert: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          cidade?: string | null
          created_at?: string
          erro?: string | null
          estado?: string | null
          id?: string
          nicho?: string | null
          pais?: string | null
          quantidade?: number | null
          status?: string
          tipo: string
          titulo: string
          total_leads?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          cidade?: string | null
          created_at?: string
          erro?: string | null
          estado?: string | null
          id?: string
          nicho?: string | null
          pais?: string | null
          quantidade?: number | null
          status?: string
          tipo?: string
          titulo?: string
          total_leads?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cnpj_cache: {
        Row: {
          cnpj: string
          consultado_em: string
          dados: Json
          fonte: string
        }
        Insert: {
          cnpj: string
          consultado_em?: string
          dados: Json
          fonte: string
        }
        Update: {
          cnpj?: string
          consultado_em?: string
          dados?: Json
          fonte?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          busca_id: string
          categoria: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          cnpj_fonte_url: string | null
          cnpj_motivo: string | null
          cnpj_origem: string | null
          cnpj_status: string
          contatado: boolean
          created_at: string
          dono: string | null
          dono_fonte: string | null
          email_receita: string | null
          endereco: string | null
          id: string
          links: Json
          logradouro: string | null
          maps_url: string | null
          municipio_receita: string | null
          natureza: string | null
          nome: string
          nome_fantasia: string | null
          pessoa: string | null
          place_id: string | null
          razao_social: string | null
          site: string | null
          situacao: string | null
          socios: Json
          status: string
          uf: string | null
          uf_receita: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          busca_id: string
          categoria?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          cnpj_fonte_url?: string | null
          cnpj_motivo?: string | null
          cnpj_origem?: string | null
          cnpj_status?: string
          contatado?: boolean
          created_at?: string
          dono?: string | null
          dono_fonte?: string | null
          email_receita?: string | null
          endereco?: string | null
          id?: string
          links?: Json
          logradouro?: string | null
          maps_url?: string | null
          municipio_receita?: string | null
          natureza?: string | null
          nome: string
          nome_fantasia?: string | null
          pessoa?: string | null
          place_id?: string | null
          razao_social?: string | null
          site?: string | null
          situacao?: string | null
          socios?: Json
          status?: string
          uf?: string | null
          uf_receita?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          busca_id?: string
          categoria?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          cnpj_fonte_url?: string | null
          cnpj_motivo?: string | null
          cnpj_origem?: string | null
          cnpj_status?: string
          contatado?: boolean
          created_at?: string
          dono?: string | null
          dono_fonte?: string | null
          email_receita?: string | null
          endereco?: string | null
          id?: string
          links?: Json
          logradouro?: string | null
          maps_url?: string | null
          municipio_receita?: string | null
          natureza?: string | null
          nome?: string
          nome_fantasia?: string | null
          pessoa?: string | null
          place_id?: string | null
          razao_social?: string | null
          site?: string | null
          situacao?: string | null
          socios?: Json
          status?: string
          uf?: string | null
          uf_receita?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_busca_id_fkey"
            columns: ["busca_id"]
            isOneToOne: false
            referencedRelation: "buscas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          mensagem_whatsapp: string
          nome: string | null
          onboarding_ok: boolean
          trabalho: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          mensagem_whatsapp?: string
          nome?: string | null
          onboarding_ok?: boolean
          trabalho?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mensagem_whatsapp?: string
          nome?: string | null
          onboarding_ok?: boolean
          trabalho?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          created_at: string
          executar_apos: string
          id: string
          lead_id: string
          reservado_em: string | null
          status: string
          tentativas: number
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          executar_apos?: string
          id?: string
          lead_id: string
          reservado_em?: string | null
          status?: string
          tentativas?: number
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          executar_apos?: string
          id?: string
          lead_id?: string
          reservado_em?: string | null
          status?: string
          tentativas?: number
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      telefones: {
        Row: {
          created_at: string
          fontes: Json
          id: string
          lead_id: string
          motivos: Json
          numero: string
          principal: boolean
          score: number
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fontes?: Json
          id?: string
          lead_id: string
          motivos?: Json
          numero: string
          principal?: boolean
          score?: number
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          fontes?: Json
          id?: string
          lead_id?: string
          motivos?: Json
          numero?: string
          principal?: boolean
          score?: number
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telefones_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reservar_slot_cnpj: { Args: { _intervalo_seg: number }; Returns: boolean }
      reservar_tarefas: {
        Args: { _limite: number; _tipo: string }
        Returns: {
          created_at: string
          executar_apos: string
          id: string
          lead_id: string
          reservado_em: string | null
          status: string
          tentativas: number
          tipo: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tarefas"
          isOneToOne: false
          isSetofReturn: true
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
