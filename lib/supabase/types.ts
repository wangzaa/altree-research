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
      pipeline_events: {
        Row: {
          agent: string | null
          created_at: string | null
          event_type: string | null
          id: number
          payload: Json | null
          stage: string | null
          thesis_id: string | null
        }
        Insert: {
          agent?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: number
          payload?: Json | null
          stage?: string | null
          thesis_id?: string | null
        }
        Update: {
          agent?: string | null
          created_at?: string | null
          event_type?: string | null
          id?: number
          payload?: Json | null
          stage?: string | null
          thesis_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_runs: {
        Row: {
          id: string
          results: Json | null
          run_at: string | null
          thesis_id: string | null
        }
        Insert: {
          id?: string
          results?: Json | null
          run_at?: string | null
          thesis_id?: string | null
        }
        Update: {
          id?: string
          results?: Json | null
          run_at?: string | null
          thesis_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_runs_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      screener_runs: {
        Row: {
          id: string
          rows: Json | null
          run_at: string | null
          thesis_id: string | null
        }
        Insert: {
          id?: string
          rows?: Json | null
          run_at?: string | null
          thesis_id?: string | null
        }
        Update: {
          id?: string
          rows?: Json | null
          run_at?: string | null
          thesis_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screener_runs_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      theses: {
        Row: {
          created_at: string | null
          id: string
          last_validated_at: string | null
          source_snippet: string | null
          status: string | null
          thesis: Json | null
          user_id: string
          verdict: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          id: string
          last_validated_at?: string | null
          source_snippet?: string | null
          status?: string | null
          thesis?: Json | null
          user_id: string
          verdict?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_validated_at?: string | null
          source_snippet?: string | null
          status?: string | null
          thesis?: Json | null
          user_id?: string
          verdict?: string | null
          version?: number | null
        }
        Relationships: []
      }
      universes: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          refreshed_at: string | null
          universe: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id: string
          refreshed_at?: string | null
          universe?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          refreshed_at?: string | null
          universe?: Json | null
        }
        Relationships: []
      }
      validation_runs: {
        Row: {
          id: string
          overall_verdict: string | null
          results: Json | null
          run_at: string | null
          thesis_id: string | null
        }
        Insert: {
          id?: string
          overall_verdict?: string | null
          results?: Json | null
          run_at?: string | null
          thesis_id?: string | null
        }
        Update: {
          id?: string
          overall_verdict?: string | null
          results?: Json | null
          run_at?: string | null
          thesis_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "validation_runs_thesis_id_fkey"
            columns: ["thesis_id"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
