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
      admin_invite_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      match_events: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          match_id: string
          minute: number
          player: string | null
          score_away: number | null
          score_home: number | null
          team: string
          type: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          match_id: string
          minute?: number
          player?: string | null
          score_away?: number | null
          score_home?: number | null
          team: string
          type: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          match_id?: string
          minute?: number
          player?: string | null
          score_away?: number | null
          score_home?: number | null
          team?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          external_id: string | null
          group_name: string | null
          id: string
          kickoff_at: string
          multiplier_override: number | null
          point_multiplier: number
          prediction_window_id: string | null
          predictions_lock_mode: Database["public"]["Enums"]["lock_mode"]
          score_a: number | null
          score_b: number | null
          stage: string
          status: Database["public"]["Enums"]["match_status"]
          team_a: string
          team_a_flag: string | null
          team_a_multiplier: number
          team_b: string
          team_b_flag: string | null
          team_b_multiplier: number
          team_multiplier_override: Json | null
          test_mode: boolean
          updated_at: string
          venue: string | null
          venue_tz: string | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          group_name?: string | null
          id?: string
          kickoff_at: string
          multiplier_override?: number | null
          point_multiplier?: number
          prediction_window_id?: string | null
          predictions_lock_mode?: Database["public"]["Enums"]["lock_mode"]
          score_a?: number | null
          score_b?: number | null
          stage?: string
          status?: Database["public"]["Enums"]["match_status"]
          team_a: string
          team_a_flag?: string | null
          team_a_multiplier?: number
          team_b: string
          team_b_flag?: string | null
          team_b_multiplier?: number
          team_multiplier_override?: Json | null
          test_mode?: boolean
          updated_at?: string
          venue?: string | null
          venue_tz?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          group_name?: string | null
          id?: string
          kickoff_at?: string
          multiplier_override?: number | null
          point_multiplier?: number
          prediction_window_id?: string | null
          predictions_lock_mode?: Database["public"]["Enums"]["lock_mode"]
          score_a?: number | null
          score_b?: number | null
          stage?: string
          status?: Database["public"]["Enums"]["match_status"]
          team_a?: string
          team_a_flag?: string | null
          team_a_multiplier?: number
          team_b?: string
          team_b_flag?: string | null
          team_b_multiplier?: number
          team_multiplier_override?: Json | null
          test_mode?: boolean
          updated_at?: string
          venue?: string | null
          venue_tz?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_prediction_window_id_fkey"
            columns: ["prediction_window_id"]
            isOneToOne: false
            referencedRelation: "prediction_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_windows: {
        Row: {
          closes_at: string
          created_at: string
          id: string
          label: string
          opens_at: string
          sort_order: number
        }
        Insert: {
          closes_at: string
          created_at?: string
          id: string
          label: string
          opens_at: string
          sort_order: number
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: string
          label?: string
          opens_at?: string
          sort_order?: number
        }
        Relationships: []
      }
      predictions: {
        Row: {
          created_at: string
          id: string
          match_id: string
          points: number
          pred_a: number
          pred_b: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          points?: number
          pred_a: number
          pred_b: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          points?: number
          pred_a?: number
          pred_b?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bonus_points: number
          created_at: string
          display_name: string
          id: string
          is_blocked: boolean
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bonus_points?: number
          created_at?: string
          display_name: string
          id: string
          is_blocked?: boolean
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bonus_points?: number
          created_at?: string
          display_name?: string
          id?: string
          is_blocked?: boolean
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          details: Json | null
          error_message: string | null
          finished_at: string | null
          function_name: string
          id: string
          started_at: string
          status: string
          updated_count: number
        }
        Insert: {
          details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          function_name: string
          id?: string
          started_at?: string
          status?: string
          updated_count?: number
        }
        Update: {
          details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          function_name?: string
          id?: string
          started_at?: string
          status?: string
          updated_count?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          exact_hits: number | null
          predictions_count: number | null
          result_hits: number | null
          total_points: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_prediction: {
        Args: { _prediction_id: string }
        Returns: undefined
      }
      calc_points: {
        Args: { pa: number; pb: number; sa: number; sb: number }
        Returns: number
      }
      calc_points_full:
        | {
            Args: {
              override: number
              pa: number
              pb: number
              sa: number
              sb: number
              stage: string
              team_a: string
              team_b: string
            }
            Returns: number
          }
        | {
            Args: {
              override: number
              pa: number
              pb: number
              sa: number
              sb: number
              stage: string
              team_a: string
              team_b: string
              team_mult?: Json
            }
            Returns: number
          }
      calc_points_match:
        | {
            Args: {
              pa: number
              pb: number
              sa: number
              sb: number
              stage: string
              team_a: string
              team_b: string
            }
            Returns: number
          }
        | {
            Args: {
              pa: number
              pb: number
              point_mult?: number
              sa: number
              sb: number
              stage: string
              team_a: string
              team_a_mult?: number
              team_b: string
              team_b_mult?: number
            }
            Returns: number
          }
        | {
            Args: {
              pa: number
              pb: number
              sa: number
              sb: number
              stage: string
              team_a: string
              team_b: string
              team_mult?: Json
            }
            Returns: number
          }
      delete_user_completely: { Args: { _user_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      list_pending_signups: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          email_confirmed_at: string
          id: string
        }[]
      }
      list_users_with_email: {
        Args: never
        Returns: {
          email: string
          id: string
        }[]
      }
      recalc_match_points: { Args: { _match_id: string }; Returns: number }
      set_user_status: {
        Args: {
          _status: Database["public"]["Enums"]["user_status"]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      lock_mode: "auto" | "force_open" | "force_closed"
      match_status: "scheduled" | "live" | "finished"
      user_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "user"],
      lock_mode: ["auto", "force_open", "force_closed"],
      match_status: ["scheduled", "live", "finished"],
      user_status: ["pending", "approved", "rejected"],
    },
  },
} as const
