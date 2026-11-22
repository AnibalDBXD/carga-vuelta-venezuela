
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "package_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"delivery_address": string,"id": string,"notes": string,"package": NonNullable<Json>,"phone": string,"pickup_address": string,"sender_name": string,"status": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"delivery_address": string,"id"?: string,"notes"?: string,"package": NonNullable<Json>,"phone": string,"pickup_address": string,"sender_name": string,"status"?: string,"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"delivery_address"?: string,"id"?: string,"notes"?: string,"package"?: NonNullable<Json>,"phone"?: string,"pickup_address"?: string,"sender_name"?: string,"status"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "package_requests_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"return_offers": {
                  Row: {
                    "active": boolean,"available_date": string,"created_at": string,"destination": string,"driver_name": string,"free_kg": number,"free_m3": number,"id": string,"notes": string | null,"origin": string,"phone": string,"trip_id": string | null,"user_id": string,"vehicle_kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"available_date": string,"created_at"?: string,"destination": string,"driver_name": string,"free_kg": number,"free_m3": number,"id"?: string,"notes"?: string | null,"origin": string,"phone": string,"trip_id"?: string | null,"user_id"?: string,"vehicle_kind": string
                  }
                  Update: {
                    "active"?: boolean,"available_date"?: string,"created_at"?: string,"destination"?: string,"driver_name"?: string,"free_kg"?: number,"free_m3"?: number,"id"?: string,"notes"?: string | null,"origin"?: string,"phone"?: string,"trip_id"?: string | null,"user_id"?: string,"vehicle_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "return_offers_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_shares": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"trip_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_shares_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: true
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "created_at": string,"departure_date": string,"destination": string,"id": string,"is_return": boolean,"notes": string | null,"origin": string,"packages": NonNullable<Json>,"parent_trip_id": string | null,"user_id": string,"vehicle_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"departure_date": string,"destination": string,"id"?: string,"is_return"?: boolean,"notes"?: string | null,"origin": string,"packages"?: NonNullable<Json>,"parent_trip_id"?: string | null,"user_id"?: string,"vehicle_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"departure_date"?: string,"destination"?: string,"id"?: string,"is_return"?: boolean,"notes"?: string | null,"origin"?: string,"packages"?: NonNullable<Json>,"parent_trip_id"?: string | null,"user_id"?: string,"vehicle_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_parent_trip_id_fkey"
      columns: ["parent_trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "brand": string | null,"created_at": string,"height_cm": number,"id": string,"kind": string,"length_cm": number,"max_kg": number,"model": string | null,"name": string,"plate": string | null,"user_id": string,"width_cm": number
                  }
                  ComputedFields: never
                  Insert: {
                    "brand"?: string | null,"created_at"?: string,"height_cm": number,"id"?: string,"kind"?: string,"length_cm": number,"max_kg": number,"model"?: string | null,"name": string,"plate"?: string | null,"user_id"?: string,"width_cm": number
                  }
                  Update: {
                    "brand"?: string | null,"created_at"?: string,"height_cm"?: number,"id"?: string,"kind"?: string,"length_cm"?: number,"max_kg"?: number,"model"?: string | null,"name"?: string,"plate"?: string | null,"user_id"?: string,"width_cm"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "decide_package_request":
{ Args: { "p_accept": boolean,"p_id": string }; Returns: string
                           },
"shared_trip":
{ Args: { "p_token": string }; Returns: Json
                           },
"submit_package_request":
{ Args: { "p_delivery": string,"p_notes"?: string,"p_package": Json,"p_phone": string,"p_pickup": string,"p_sender": string,"p_token": string }; Returns: string
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
