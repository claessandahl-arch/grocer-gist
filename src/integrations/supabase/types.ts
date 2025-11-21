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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      global_product_mappings: {
        Row: {
          category: string | null
          created_at: string
          id: string
          mapped_name: string
          original_name: string
          quantity_amount: number | null
          quantity_unit: string | null
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          mapped_name: string
          original_name: string
          quantity_amount?: number | null
          quantity_unit?: string | null
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          mapped_name?: string
          original_name?: string
          quantity_amount?: number | null
          quantity_unit?: string | null
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      ignored_merge_suggestions: {
        Row: {
          created_at: string
          id: string
          products: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          products: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          products?: string[]
          user_id?: string
        }
        Relationships: []
      }
      product_mappings: {
        Row: {
          category: string | null
          created_at: string
          id: string
          mapped_name: string
          original_name: string
          quantity_amount: number | null
          quantity_unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          mapped_name: string
          original_name: string
          quantity_amount?: number | null
          quantity_unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          mapped_name?: string
          original_name?: string
          quantity_amount?: number | null
          quantity_unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipt_corrections: {
        Row: {
          corrected_data: Json
          correction_notes: string | null
          created_at: string
          id: string
          original_data: Json
          receipt_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          corrected_data: Json
          correction_notes?: string | null
          created_at?: string
          id?: string
          original_data: Json
          receipt_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          corrected_data?: Json
          correction_notes?: string | null
          created_at?: string
          id?: string
          original_data?: Json
          receipt_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_corrections_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          image_urls: Json | null
          items: Json | null
          receipt_date: string | null
          store_name: string | null
          total_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          items?: Json | null
          receipt_date?: string | null
          store_name?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          items?: Json | null
          receipt_date?: string | null
          store_name?: string | null
          total_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      store_patterns: {
        Row: {
          created_at: string
          id: string
          pattern_data: Json
          store_name: string
          success_rate: number | null
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          pattern_data: Json
          store_name: string
          success_rate?: number | null
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          pattern_data?: Json
          store_name?: string
          success_rate?: number | null
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      user_global_overrides: {
        Row: {
          created_at: string
          global_mapping_id: string
          id: string
          override_category: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          global_mapping_id: string
          id?: string
          override_category: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          global_mapping_id?: string
          id?: string
          override_category?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_global_overrides_global_mapping_id_fkey"
            columns: ["global_mapping_id"]
            isOneToOne: false
            referencedRelation: "global_product_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      view_category_breakdown: {
        Row: {
          category: string | null
          month_start: string | null
          total_spend: number | null
          user_id: string | null
        }
        Relationships: []
      }
      view_monthly_stats: {
        Row: {
          avg_per_receipt: number | null
          month_start: string | null
          receipt_count: number | null
          total_spend: number | null
          user_id: string | null
        }
        Relationships: []
      }
      view_price_comparison: {
        Row: {
          avg_price_per_unit: number | null
          best_store_name: string | null
          data_points: number | null
          mapped_name: string | null
          max_price_per_unit: number | null
          min_price_per_unit: number | null
          quantity_unit: string | null
        }
        Relationships: []
      }
      view_store_comparison: {
        Row: {
          month_start: string | null
          store_name: string | null
          total_spend: number | null
          user_id: string | null
          visit_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      extract_unit_info: {
        Args: { product_name: string }
        Returns: {
          quantity_amount: number
          quantity_unit: string
        }[]
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
