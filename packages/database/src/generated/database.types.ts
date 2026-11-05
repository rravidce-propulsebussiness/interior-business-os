Warning: truncated output (original token count: 102742)
Total output lines: 13141

// Generated from the applied PostgreSQL catalog by scripts/generate-types.mjs. Do not edit.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface Database {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          id: string;
          actor_user_id: string | null;
          organization_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          organization_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string | null;
          organization_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      automation_events: {
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          entity_kind: string;
          entity_id: string;
          actor_id: string | null;
          occurred_at: string;
          chain_depth: number;
          dedupe_key: string;
          dispatched_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          entity_kind: string;
          entity_id: string;
          actor_id?: string | null;
          occurred_at?: string;
          chain_depth?: number;
          dedupe_key: string;
          dispatched_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          event_type?: string;
          entity_kind?: string;
          entity_id?: string;
          actor_id?: string | null;
          occurred_at?: string;
          chain_depth?: number;
          dedupe_key?: string;
          dispatched_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      automation_executions: {
        Row: {
          id: string;
          organization_id: string;
          rule_id: string;
          rule_version_id: string;
          event_id: string;
          status: string;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          reason: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          rule_id: string;
          rule_version_id: string;
          event_id: string;
          status?: string;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          reason?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          rule_id?: string;
          rule_version_id?: string;
          event_id?: string;
          status?: string;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_executions_organization_id_event_id_fkey';
            columns: ['organization_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'automation_events';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'automation_executions_organization_id_rule_id_fkey';
            columns: ['organization_id', 'rule_id'];
            isOneToOne: false;
            referencedRelation: 'automation_rules';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'automation_executions_organization_id_rule_version_id_fkey';
            columns: ['organization_id', 'rule_version_id'];
            isOneToOne: false;
            referencedRelation: 'automation_rule_versions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      automation_jobs: {
        Row: {
          id: string;
          organization_id: string;
          execution_id: string;
          action_index: number;
          action: Json;
          run_at: string;
          status: string;
          attempts: number;
          lease_token: string | null;
          lease_until: string | null;
          result_id: string | null;
          error_code: string;
          created_at: string;
          completed_at: string | null;
          manual_retries: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          execution_id: string;
          action_index: number;
          action: Json;
          run_at: string;
          status?: string;
          attempts?: number;
          lease_token?: string | null;
          lease_until?: string | null;
          result_id?: string | null;
          error_code?: string;
          created_at?: string;
          completed_at?: string | null;
          manual_retries?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          execution_id?: string;
          action_index?: number;
          action?: Json;
          run_at?: string;
          status?: string;
          attempts?: number;
          lease_token?: string | null;
          lease_until?: string | null;
          result_id?: string | null;
          error_code?: string;
          created_at?: string;
          completed_at?: string | null;
          manual_retries?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_jobs_organization_id_execution_id_fkey';
            columns: ['organization_id', 'execution_id'];
            isOneToOne: false;
            referencedRelation: 'automation_executions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      automation_rule_versions: {
        Row: {
          id: string;
          organization_id: string;
          rule_id: string;
          version: number;
          configuration: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          rule_id: string;
          version: number;
          configuration: Json;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          rule_id?: string;
          version?: number;
          configuration?: Json;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_rule_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_rule_versions_organization_id_rule_id_fkey';
            columns: ['organization_id', 'rule_id'];
            isOneToOne: false;
            referencedRelation: 'automation_rules';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      automation_rules: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          event_type: string;
          mode: string;
          status: string;
          configuration: Json;
          version: number;
          run_as: string;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string;
          event_type: string;
          mode: string;
          status: string;
          configuration: Json;
          version?: number;
          run_as: string;
          created_by: string;
          updated_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string;
          event_type?: string;
          mode?: string;
          status?: string;
          configuration?: Json;
          version?: number;
          run_as?: string;
          created_by?: string;
          updated_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_rules_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_rules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_rules_organization_id_run_as_fkey';
            columns: ['organization_id', 'run_as'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'automation_rules_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      automation_settings: {
        Row: {
          organization_id: string;
          version: number;
          notification_daily_limit: number;
          email_daily_limit: number;
          customer_email_enabled: boolean;
          retention_days: number;
          updated_by: string | null;
          updated_at: string;
          recipient_cooldown_minutes: number;
        };
        Insert: {
          organization_id: string;
          version?: number;
          notification_daily_limit?: number;
          email_daily_limit?: number;
          customer_email_enabled?: boolean;
          retention_days?: number;
          updated_by?: string | null;
          updated_at?: string;
          recipient_cooldown_minutes?: number;
        };
        Update: {
          organization_id?: string;
          version?: number;
          notification_daily_limit?: number;
          email_daily_limit?: number;
          customer_email_enabled?: boolean;
          retention_days?: number;
          updated_by?: string | null;
          updated_at?: string;
          recipient_cooldown_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_settings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      branches: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          status: string;
          timezone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          status?: string;
          timezone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          code?: string;
          status?: string;
          timezone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'branches_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      brochure_events: {
        Row: {
          id: string;
          organization_id: string;
          brochure_id: string | null;
          actor_id: string | null;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brochure_id?: string | null;
          actor_id?: string | null;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brochure_id?: string | null;
          actor_id?: string | null;
          action?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'brochure_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brochure_events_organization_id_brochure_id_fkey';
            columns: ['organization_id', 'brochure_id'];
            isOneToOne: false;
            referencedRelation: 'brochures';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'brochure_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      brochure_plan_limits: {
        Row: {
          plan_id: string;
          configuration: Json;
        };
        Insert: {
          plan_id: string;
          configuration?: Json;
        };
        Update: {
          plan_id?: string;
          configuration?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'brochure_plan_limits_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      brochure_versions: {
        Row: {
          id: string;
          organization_id: string;
          brochure_id: string;
          sequence: number;
          snapshot: Json;
          business_name: string;
          summary: string;
          pdf_digest: string;
          restored_from: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          brochure_id: string;
          sequence: number;
          snapshot: Json;
          business_name: string;
          summary?: string;
          pdf_digest: string;
          restored_from?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          brochure_id?: string;
          sequence?: number;
          snapshot?: Json;
          business_name?: string;
          summary?: string;
          pdf_digest?: string;
          restored_from?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'brochure_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brochure_versions_organization_id_brochure_id_fkey';
            columns: ['organization_id', 'brochure_id'];
            isOneToOne: false;
            referencedRelation: 'brochures';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'brochure_versions_organization_id_brochure_id_restored_fro_fkey';
            columns: ['organization_id', 'brochure_id', 'restored_from'];
            isOneToOne: false;
            referencedRelation: 'brochure_versions';
            referencedColumns: ['organization_id', 'brochure_id', 'id'];
          },
          {
            foreignKeyName: 'brochure_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      brochures: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          type: string;
          status: string;
          version: number;
          document: Json;
          published_version_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug: string;
          type: string;
          status?: string;
          version?: number;
          document: Json;
          published_version_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          slug?: string;
          type?: string;
          status?: string;
          version?: number;
          document?: Json;
          published_version_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'brochures_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brochures_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'brochures_organization_id_id_published_version_id_fkey';
            columns: ['organization_id', 'id', 'published_version_id'];
            isOneToOne: false;
            referencedRelation: 'brochure_versions';
            referencedColumns: ['organization_id', 'brochure_id', 'id'];
          },
        ];
      };
      catalog_attribute_options: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          item_id: string;
          attribute_id: string;
          key: string;
          label: string;
          description: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          item_id: string;
          attribute_id: string;
          key: string;
          label: string;
          description?: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          item_id?: string;
          attribute_id?: string;
          key?: string;
          label?: string;
          description?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_attribute_options_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_attribute_options_organization_id_item_id_attribut_fkey';
            columns: ['organization_id', 'item_id', 'attribute_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_item_attributes';
            referencedColumns: ['organization_id', 'item_id', 'id'];
          },
        ];
      };
      catalog_categories: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          description: string;
          sort_order: number;
          industry_id: string | null;
          parent_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          key: string;
          description?: string;
          sort_order?: number;
          industry_id?: string | null;
          parent_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          name?: string;
          key?: string;
          description?: string;
          sort_order?: number;
          industry_id?: string | null;
          parent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_categories_industry_id_fkey';
            columns: ['industry_id'];
            isOneToOne: false;
            referencedRelation: 'industries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_categories_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_categories_organization_id_parent_id_fkey';
            columns: ['organization_id', 'parent_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_categories';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      catalog_item_attributes: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          item_id: string;
          key: string;
          label: string;
          input_type: string;
          required: boolean;
          visible_sales: boolean;
          visible_customer: boolean;
          affects_pricing: boolean;
          default_options: Json;
          conditions: Json;
          help_text: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          item_id: string;
          key: string;
          label: string;
          input_type: string;
          required?: boolean;
          visible_sales?: boolean;
          visible_customer?: boolean;
          affects_pricing?: boolean;
          default_options?: Json;
          conditions?: Json;
          help_text?: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          item_id?: string;
          key?: string;
          label?: string;
          input_type?: string;
          required?: boolean;
          visible_sales?: boolean;
          visible_customer?: boolean;
          affects_pricing?: boolean;
          default_options?: Json;
          conditions?: Json;
          help_text?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_item_attributes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_item_attributes_organization_id_item_id_fkey';
            columns: ['organization_id', 'item_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_items';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      catalog_items: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          description: string;
          sort_order: number;
          category_id: string | null;
          industry_id: string | null;
          unit_key: string;
          method_key: string;
          quantity_rounding: Json;
          amount_rounding: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          key: string;
          description?: string;
          sort_order?: number;
          category_id?: string | null;
          industry_id?: string | null;
          unit_key: string;
          method_key: string;
          quantity_rounding?: Json;
          amount_rounding?: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          name?: string;
          key?: string;
          description?: string;
          sort_order?: number;
          category_id?: string | null;
          industry_id?: string | null;
          unit_key?: string;
          method_key?: string;
          quantity_rounding?: Json;
          amount_rounding?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'catalog_items_industry_id_fkey';
            columns: ['industry_id'];
            isOneToOne: false;
            referencedRelation: 'industries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_items_method_key_fkey';
            columns: ['method_key'];
            isOneToOne: false;
            referencedRelation: 'measurement_methods';
            referencedColumns: ['key'];
          },
          {
            foreignKeyName: 'catalog_items_organization_id_category_id_fkey';
            columns: ['organization_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_categories';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'catalog_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalog_items_unit_key_fkey';
            columns: ['unit_key'];
            isOneToOne: false;
            referencedRelation: 'units';
            referencedColumns: ['key'];
          },
        ];
      };
      change_order_items: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          change_order_id: string;
          change_type: string;
          description: string;
          reason: string;
          area: string;
          original_item_id: string | null;
          original_amount: string;
          new_amount: string;
          net_adjustment: string;
          new_snapshot: Json | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          change_order_id: string;
          change_type: string;
          description: string;
          reason: string;
          area?: string;
          original_item_id?: string | null;
          original_amount?: string;
          new_amount?: string;
          net_adjustment: string;
          new_snapshot?: Json | null;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          change_order_id?: string;
          change_type?: string;
          description?: string;
          reason?: string;
          area?: string;
          original_item_id?: string | null;
          original_amount?: string;
          new_amount?: string;
          net_adjustment?: string;
          new_snapshot?: Json | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'change_order_items_organization_id_contract_id_change_orde_fkey';
            columns: ['organization_id', 'contract_id', 'change_order_id'];
            isOneToOne: false;
            referencedRelation: 'change_orders';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'change_order_items_organization_id_original_item_id_fkey';
            columns: ['organization_id', 'original_item_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_items';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      change_orders: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          change_order_number: string;
          reason: string;
          status: string;
          version: number;
          net_adjustment: string;
          previous_contract_value: string | null;
          revised_contract_value: string | null;
          document_snapshot: Json | null;
          terms: string;
          issued_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          approval_evidence: string | null;
          decision_reason: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          change_order_number: string;
          reason: string;
          status?: string;
          version?: number;
          net_adjustment?: string;
          previous_contract_value?: string | null;
          revised_contract_value?: string | null;
          document_snapshot?: Json | null;
          terms?: string;
          issued_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          approval_evidence?: string | null;
          decision_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          change_order_number?: string;
          reason?: string;
          status?: string;
          version?: number;
          net_adjustment?: string;
          previous_contract_value?: string | null;
          revised_contract_value?: string | null;
          document_snapshot?: Json | null;
          terms?: string;
          issued_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          approval_evidence?: string | null;
          decision_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'change_orders_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'change_orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'change_orders_organization_id_contract_id_fkey';
            columns: ['organization_id', 'contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      communication_consents: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          email_enabled: boolean;
          evidence: string;
          version: number;
          updated_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          email_enabled?: boolean;
          evidence: string;
          version?: number;
          updated_by: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          email_enabled?: boolean;
          evidence?: string;
          version?: number;
          updated_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'communication_consents_organization_id_customer_id_fkey';
            columns: ['organization_id', 'customer_id'];
            isOneToOne: true;
            referencedRelation: 'customers';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'communication_consents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'communication_consents_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      construction_package_spec_attachments: {
        Row: {
          id: string;
          organization_id: string;
          package_id: string;
          storage_path: string;
          filename: string;
          byte_size: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          package_id: string;
          storage_path: string;
          filename: string;
          byte_size: number;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          package_id?: string;
          storage_path?: string;
          filename?: string;
          byte_size?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'construction_package_spec_attachments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      contracts: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          project_id: string;
          revision_id: string;
          acceptance_id: string | null;
          lead_id: string | null;
          branch_id: string | null;
          contract_number: string;
          currency: string;
          precision: number;
          original_contract_value: string;
          source_snapshot: Json;
          status: string;
          version: number;
          accepted_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          closed_at: string | null;
          cancelled_at: string | null;
          status_reason: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id: string;
          project_id: string;
          revision_id: string;
          acceptance_id?: string | null;
          lead_id?: string | null;
          branch_id?: string | null;
          contract_number: string;
          currency: string;
          precision: number;
          original_contract_value: string;
          source_snapshot: Json;
          status?: string;
          version?: number;
          accepted_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
          status_reason?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_id?: string;
          project_id?: string;
          revision_id?: string;
          acceptance_id?: string | null;
          lead_id?: string | null;
          branch_id?: string | null;
          contract_number?: string;
          currency?: string;
          precision?: number;
          original_contract_value?: string;
          source_snapshot?: Json;
          status?: string;
          version?: number;
          accepted_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
          status_reason?: string;
          created_by?: string;
          cr…82742 tokens truncated…     Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      execution_po_progress: {
        Args: { p_organization_id: string; p_po_id: string };
        Returns: Json;
      };
      execution_po_transition: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_action: string;
          p_reason?: string;
        };
        Returns: string;
      };
      execution_quantity_preview: {
        Args: {
          p_organization_id: string;
          p_rule: Json;
          p_measurements: Json;
          p_conversion: Json;
          p_waste: string;
          p_override?: string;
        };
        Returns: Json;
      };
      execution_receipt_record: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      execution_recipe_apply: {
        Args: {
          p_organization_id: string;
          p_revision_id: string;
          p_input: Json;
        };
        Returns: string;
      };
      execution_requisition_create: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      execution_requisition_transition: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_action: string;
          p_reason?: string;
        };
        Returns: string;
      };
      execution_rfq_create: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      execution_rfq_transition: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_action: string;
        };
        Returns: string;
      };
      execution_scope: {
        Args: { p_organization_id: string; p_contract_id: string };
        Returns: Json;
      };
      execution_search: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_filter?: Json;
          p_page?: number;
        };
        Returns: Json;
      };
      execution_vendor_comparison: {
        Args: { p_organization_id: string; p_rfq_id: string };
        Returns: Json;
      };
      execution_vendor_quote_save: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      execution_vendor_quote_transition: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_action: string;
        };
        Returns: string;
      };
      finance_configure: {
        Args: { p_organization_id: string; p_entity: string; p_input: Json };
        Returns: string;
      };
      finance_contract_scope: {
        Args: { p_organization_id: string; p_contract_id: string };
        Returns: Json;
      };
      finance_detail: {
        Args: { p_organization_id: string; p_entity: string; p_id: string };
        Returns: Json;
      };
      finance_document: {
        Args: { p_organization_id: string; p_entity: string; p_id: string };
        Returns: Json;
      };
      finance_search: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_filter?: Json;
          p_page?: number;
        };
        Returns: Json;
      };
      finance_summary: {
        Args: {
          p_organization_id: string;
          p_contract_id?: string;
          p_customer_id?: string;
        };
        Returns: Json;
      };
      finance_timeline: {
        Args: {
          p_organization_id: string;
          p_contract_id: string;
          p_page?: number;
        };
        Returns: Json;
      };
      gst_company_template_select: {
        Args: { p_org: string; p_template_id: string; p_style?: Json };
        Returns: undefined;
      };
      gst_customer_invoice_context: {
        Args: { p_org: string; p_invoice: string };
        Returns: string;
      };
      gst_customer_invoice_save: {
        Args: { p_org: string; p_input: Json; p_customer?: string };
        Returns: string;
      };
      gst_document: { Args: { p_org: string; p_id: string }; Returns: Json };
      gst_document_finalize: {
        Args: { p_org: string; p_id: string; p_version: number };
        Returns: string;
      };
      gst_document_layout: {
        Args: { p_org: string; p_id: string };
        Returns: Json;
      };
      gst_document_save: {
        Args: { p_org: string; p_input: Json };
        Returns: string;
      };
      gst_document_with_template_save: {
        Args: { p_org: string; p_input: Json; p_template_id?: string };
        Returns: string;
      };
      gst_documents: {
        Args: { p_org: string; p_kind?: string };
        Returns: Json;
      };
      gst_filing_workpaper: {
        Args: { p_org: string; p_from: string; p_to: string; p_kind?: string };
        Returns: Json;
      };
      gst_invoice_customer_options: { Args: { p_org: string }; Returns: Json };
      gst_profile_read: { Args: { p_org: string }; Returns: Json };
      gst_profile_save: {
        Args: { p_org: string; p_input: Json };
        Returns: undefined;
      };
      gst_sales_invoice_save_and_issue: {
        Args: {
          p_org: string;
          p_input: Json;
          p_customer?: string;
          p_won_lead?: string;
          p_stage_lead?: string;
          p_revision?: string;
          p_stage?: number;
        };
        Returns: string;
      };
      gst_stage_invoice_context: {
        Args: { p_org: string; p_invoice: string };
        Returns: Json;
      };
      gst_stage_invoice_options: { Args: { p_org: string }; Returns: Json };
      gst_stage_invoice_save: {
        Args: {
          p_org: string;
          p_input: Json;
          p_lead: string;
          p_revision: string;
          p_stage: number;
        };
        Returns: string;
      };
      gst_standard_invoice_format: { Args: { p_org?: string }; Returns: Json };
      gst_standard_invoice_select: {
        Args: { p_template_id: string };
        Returns: undefined;
      };
      gst_template_list: { Args: { p_org?: string }; Returns: Json };
      gst_template_save: { Args: { p_input: Json }; Returns: string };
      gst_template_set_status: {
        Args: { p_id: string; p_active: boolean };
        Returns: undefined;
      };
      gst_won_lead_invoice_context: {
        Args: { p_org: string; p_invoice: string };
        Returns: string;
      };
      gst_won_lead_invoice_save: {
        Args: { p_org: string; p_input: Json; p_lead: string };
        Returns: string;
      };
      has_entitlement: {
        Args: { p_organization_id: string; p_module_key: string };
        Returns: boolean;
      };
      invite_member: {
        Args: {
          p_organization_id: string;
          p_user_id: string;
          p_branch_id?: string;
        };
        Returns: string;
      };
      invoice_issue: {
        Args: { p_organization_id: string; p_id: string; p_version: number };
        Returns: string;
      };
      invoice_save: {
        Args: {
          p_organization_id: string;
          p_contract_id: string;
          p_input: Json;
        };
        Returns: string;
      };
      invoice_void: {
        Args: { p_organization_id: string; p_id: string; p_reason: string };
        Returns: string;
      };
      labour_disbursement_create: {
        Args: { p_org: string; p_input: Json };
        Returns: string;
      };
      labour_disbursement_mark_paid: {
        Args: {
          p_org: string;
          p_id: string;
          p_method: string;
          p_reference?: string;
        };
        Returns: undefined;
      };
      labour_disbursements_list: {
        Args: { p_org: string; p_from: string; p_to: string };
        Returns: Json;
      };
      lead_quotation_link: {
        Args: {
          p_organization_id: string;
          p_lead_id: string;
          p_quotation_id: string;
          p_project_id: string;
        };
        Returns: undefined;
      };
      lead_quotation_link_provisional: {
        Args: {
          p_organization_id: string;
          p_lead_id: string;
          p_quotation_id: string;
          p_project_id: string;
          p_new_customer: boolean;
          p_new_project: boolean;
        };
        Returns: undefined;
      };
      lead_quotation_list: {
        Args: { p_organization_id: string; p_lead_id: string };
        Returns: Json;
      };
      lead_quotation_summary: {
        Args: { p_organization_id: string; p_lead_ids: string[] };
        Returns: Json;
      };
      management_dashboard: {
        Args: { p_organization_id: string; p_filters: Json };
        Returns: Json;
      };
      marketplace_catalog: {
        Args: {
          p_organization_id: string;
          p_industry_id?: string;
          p_query?: string;
        };
        Returns: Json;
      };
      marketplace_industry_create: {
        Args: { p_key: string; p_name: string };
        Returns: string;
      };
      marketplace_order_decide: {
        Args: {
          p_organization_id: string;
          p_order_id: string;
          p_action: string;
        };
        Returns: undefined;
      };
      marketplace_order_place: {
        Args: {
          p_organization_id: string;
          p_product_id: string;
          p_quantity: number;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      marketplace_orders: {
        Args: { p_organization_id: string; p_role?: string };
        Returns: Json;
      };
      marketplace_product_save: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      marketplace_seller_apply: {
        Args: { p_organization_id: string; p_name: string };
        Returns: string;
      };
      marketplace_seller_decide: {
        Args: { p_seller_id: string; p_action: string };
        Returns: undefined;
      };
      marketplace_seller_industry_assign: {
        Args: { p_organization_id: string; p_industry_id: string };
        Returns: undefined;
      };
      marketplace_seller_profile: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      marketplace_sellers_review: {
        Args: { p_status?: string };
        Returns: Json;
      };
      notification_preferences_save: {
        Args: {
          p_organization_id: string;
          p_version: number;
          p_configuration: Json;
        };
        Returns: number;
      };
      notification_state: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_status: string;
        };
        Returns: number;
      };
      notification_target: {
        Args: { p_organization_id: string; p_id: string };
        Returns: Json;
      };
      notifications_read: {
        Args: { p_organization_id: string; p_page?: number; p_status?: string };
        Returns: Json;
      };
      operations_balances: {
        Args: {
          p_organization_id: string;
          p_project_id?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      operations_closure: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      operations_costs: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      operations_dashboard: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      operations_document: {
        Args: {
          p_organization_id: string;
          p_kind: string;
          p_id: string;
          p_filter?: Json;
        };
        Returns: Json;
      };
      operations_handover: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_inspection: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_issue_request: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_materials: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_area_id?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      operations_options: {
        Args: {
          p_organization_id: string;
          p_kind: string;
          p_project_id?: string;
          p_query?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      operations_plan: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_plan_refresh: {
        Args: { p_organization_id: string; p_id: string; p_version: number };
        Returns: string;
      };
      operations_save: {
        Args: { p_organization_id: string; p_entity: string; p_input: Json };
        Returns: string;
      };
      operations_scope_status: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_page?: number;
        };
        Returns: Json;
      };
      operations_search: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_filter?: Json;
          p_page?: number;
        };
        Returns: Json;
      };
      operations_snag: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_stock: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_task: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      operations_timeline: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_page?: number;
        };
        Returns: Json;
      };
      operations_work_order: {
        Args: { p_organization_id: string; p_operation: string; p_input: Json };
        Returns: string;
      };
      organization_construction_payment_defaults_read: {
        Args: { p_org: string };
        Returns: Json;
      };
      organization_construction_payment_defaults_save: {
        Args: { p_org: string; p_rows: Json };
        Returns: undefined;
      };
      organization_context: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      organization_identity_settings_read: {
        Args: { p_org: string };
        Returns: Json;
      };
      organization_identity_settings_save: {
        Args: { p_org: string; p_input: Json };
        Returns: undefined;
      };
      owner_test_data_reset_execute: {
        Args: { p_org: string; p_phrase: string; p_signature: string };
        Returns: Json;
      };
      owner_test_data_reset_preview: { Args: { p_org: string }; Returns: Json };
      payment_allocate: {
        Args: {
          p_organization_id: string;
          p_payment_id: string;
          p_input: Json;
        };
        Returns: string;
      };
      payment_record: {
        Args: {
          p_organization_id: string;
          p_contract_id: string;
          p_input: Json;
        };
        Returns: string;
      };
      payment_request_issue: {
        Args: {
          p_organization_id: string;
          p_item_id: string;
          p_due_date?: string;
          p_note?: string;
        };
        Returns: string;
      };
      payment_request_void: {
        Args: { p_organization_id: string; p_id: string; p_reason: string };
        Returns: string;
      };
      payment_schedule_activate: {
        Args: { p_organization_id: string; p_id: string; p_version: number };
        Returns: string;
      };
      payment_schedule_save: {
        Args: {
          p_organization_id: string;
          p_contract_id: string;
          p_input: Json;
        };
        Returns: string;
      };
      payment_void: {
        Args: { p_organization_id: string; p_id: string; p_reason: string };
        Returns: string;
      };
      platform_company_create: { Args: { p_input: Json }; Returns: Json };
      platform_company_directory: {
        Args: {
          p_query?: string;
          p_status?: string;
          p_industry_id?: string;
          p_kind?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      platform_company_industry_set: {
        Args: {
          p_organization_id: string;
          p_industry_id: string;
          p_enabled: boolean;
        };
        Returns: undefined;
      };
      platform_company_profile: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      platform_company_role_set: {
        Args: {
          p_organization_id: string;
          p_membership_id: string;
          p_role_id: string;
          p_remove: boolean;
        };
        Returns: undefined;
      };
      platform_company_seller_enable: {
        Args: { p_organization_id: string; p_store_name: string };
        Returns: string;
      };
      platform_context: { Args: Record<string, never>; Returns: Json };
      platform_gst_summary: { Args: Record<string, never>; Returns: Json };
      platform_owner_directory: {
        Args: {
          p_query?: string;
          p_status?: string;
          p_industry_id?: string;
          p_page?: number;
          p_sort?: string;
          p_kind?: string;
        };
        Returns: Json;
      };
      platform_owner_email_status: {
        Args: { p_email: string };
        Returns: string;
      };
      platform_plan_create: { Args: { p_input: Json }; Returns: string };
      platform_set_entitlement: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      platform_set_organization: {
        Args: {
          p_organization_id: string;
          p_status: string;
          p_plan_id?: string;
        };
        Returns: undefined;
      };
      platform_set_role: {
        Args: { p_user_id: string; p_role_id: string; p_remove?: boolean };
        Returns: undefined;
      };
      platform_user_company_assign: {
        Args: {
          p_user_id: string;
          p_organization_id: string;
          p_role_id: string;
        };
        Returns: string;
      };
      platform_user_company_choices: {
        Args: Record<string, never>;
        Returns: Json;
      };
      platform_user_directory: {
        Args: {
          p_query?: string;
          p_kind?: string;
          p_status?: string;
          p_industry_id?: string;
          p_page?: number;
          p_sort?: string;
        };
        Returns: Json;
      };
      platform_user_profile: { Args: { p_user_id: string }; Returns: Json };
      platform_user_status_set: {
        Args: { p_user_id: string; p_status: string };
        Returns: undefined;
      };
      project_advance_proforma_prepare: {
        Args: { p_org: string; p_project: string; p_percent: number };
        Returns: string;
      };
      project_advance_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      project_agreement_command: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_contract_id: string;
          p_action: string;
          p_input?: Json;
        };
        Returns: string;
      };
      project_agreement_read: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      project_client_request_create: {
        Args: {
          p_project_id: string;
          p_kind: string;
          p_details: string;
          p_requested_date?: string;
        };
        Returns: string;
      };
      project_client_request_list: {
        Args: { p_project_id: string };
        Returns: Json;
      };
      project_client_request_respond: {
        Args: {
          p_org: string;
          p_project_id: string;
          p_request_id: string;
          p_status: string;
          p_response: string;
        };
        Returns: undefined;
      };
      project_material_access_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      project_material_delivery_command: {
        Args: {
          p_org: string;
          p_project: string;
          p_material: string;
          p_action: string;
          p_reference?: string;
          p_expected_date?: string;
          p_window?: string;
        };
        Returns: Json;
      };
      project_material_permission_set: {
        Args: {
          p_org: string;
          p_project: string;
          p_user: string;
          p_allowed: boolean;
        };
        Returns: Json;
      };
      project_permanent_delete: {
        Args: {
          p_org: string;
          p_project: string;
          p_version: number;
          p_confirm: string;
        };
        Returns: boolean;
      };
      project_preflight_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      project_preflight_save: {
        Args: {
          p_org: string;
          p_project: string;
          p_kind: string;
          p_details: string;
        };
        Returns: Json;
      };
      project_quote_stage_guidance_import: {
        Args: { p_org: string; p_contract: string };
        Returns: Json;
      };
      project_quote_timeline_create: {
        Args: { p_org: string; p_contract: string; p_input: Json };
        Returns: Json;
      };
      project_remove_from_workspace: {
        Args: {
          p_org: string;
          p_project: string;
          p_version: number;
          p_confirm: string;
        };
        Returns: string;
      };
      project_site_command: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_action: string;
          p_input?: Json;
        };
        Returns: Json;
      };
      project_site_manager_command: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_action: string;
          p_input?: Json;
        };
        Returns: Json;
      };
      project_site_manager_read: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      project_site_marketplace_order: {
        Args: {
          p_org: string;
          p_project: string;
          p_material: string;
          p_product: string;
          p_request_key: string;
        };
        Returns: string;
      };
      project_site_material_batch: {
        Args: { p_org: string; p_project: string; p_items: Json };
        Returns: Json;
      };
      project_site_media_get: {
        Args: { p_organization_id: string; p_project_id: string; p_id: string };
        Returns: Json;
      };
      project_site_media_put: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_category: string;
          p_filename: string;
          p_mime: string;
          p_base64: string;
          p_caption?: string;
        };
        Returns: string;
      };
      project_site_media_put_r2: {
        Args: {
          p_organization_id: string;
          p_project_id: string;
          p_category: string;
          p_filename: string;
          p_mime: string;
          p_caption: string;
          p_r2_key: string;
          p_byte_size: number;
          p_sha256: string;
        };
        Returns: string;
      };
      project_site_media_r2_key: {
        Args: { p_organization_id: string; p_project_id: string; p_id: string };
        Returns: string;
      };
      project_site_my_projects: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      project_site_read: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      project_stage_activity_material_batch: {
        Args: {
          p_org: string;
          p_project: string;
          p_stage: string;
          p_items: Json;
          p_activity_index: number;
        };
        Returns: Json;
      };
      project_stage_checklist_batch_command: {
        Args: {
          p_org: string;
          p_project: string;
          p_stage: string;
          p_items: Json;
          p_finish?: boolean;
        };
        Returns: Json;
      };
      project_stage_checklist_command: {
        Args: {
          p_org: string;
          p_project: string;
          p_stage: string;
          p_kind: string;
          p_index: number;
          p_title: string;
          p_action: string;
          p_note?: string;
          p_photo?: string;
        };
        Returns: Json;
      };
      project_stage_checklist_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      project_stage_guidance_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      project_stage_item_schedule_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      project_stage_item_schedule_save: {
        Args: {
          p_org: string;
          p_project: string;
          p_stage: string;
          p_kind: string;
          p_index: number;
          p_title: string;
          p_start: string;
          p_finish: string;
          p_note?: string;
          p_expected_version?: number;
        };
        Returns: Json;
      };
      project_stage_material_batch: {
        Args: {
          p_org: string;
          p_project: string;
          p_stage: string;
          p_items: Json;
        };
        Returns: Json;
      };
      project_stage_owner_edit: {
        Args: {
          p_org: string;
          p_project: string;
          p_stage: string;
          p_expected_version: number;
          p_input: Json;
        };
        Returns: Json;
      };
      project_stage_owner_read: {
        Args: { p_org: string; p_project: string };
        Returns: Json;
      };
      propulse_company_import: {
        Args: { p_user_id: string; p_subject: string; p_company: Json };
        Returns: Json;
      };
      propulse_company_profile: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      public_quotation: {
        Args: { p_token: string; p_operation?: string; p_input?: Json };
        Returns: Json;
      };
      quotation_calculation_context: {
        Args: { p_message: string; p_signature: string };
        Returns: Json;
      };
      quotation_final_choices: {
        Args: { p_org: string; p_customer_ids: string[] };
        Returns: Json;
      };
      quotation_final_eligible: {
        Args: { p_org: string; p_quotation_ids: string[] };
        Returns: Json;
      };
      quotation_final_marked: {
        Args: { p_org: string; p_customer_ids: string[] };
        Returns: Json;
      };
      quotation_item_configuration: {
        Args: {
          p_organization_id: string;
          p_item_id: string;
          p_branch_id?: string;
        };
        Returns: Json;
      };
      quotation_mark_final: {
        Args: { p_org: string; p_quotation: string };
        Returns: boolean;
      };
      quotation_package_delete: {
        Args: { p_org: string; p_package_id: string; p_version: number };
        Returns: boolean;
      };
      quotation_package_list: { Args: { p_org: string }; Returns: Json };
      quotation_package_save: {
        Args: { p_org: string; p_input: Json };
        Returns: string;
      };
      quotation_prospect_project_create: {
        Args: {
          p_organization_id: string;
          p_customer_id: string;
          p_industry_id: string;
          p_name: string;
          p_project_type: string;
          p_site_city: string;
          p_notes: string;
          p_new_customer?: boolean;
        };
        Returns: string;
      };
      quotation_prospect_ready: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      quotation_refresh_draft_branding: {
        Args: {
          p_organization_id: string;
          p_revision_id: string;
          p_expected_version: number;
        };
        Returns: number;
      };
      quotation_response_queue: {
        Args: {
          p_organization_id: string;
          p_status?: string;
          p_project_id?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      quotation_share_manage: {
        Args: { p_organization_id: string; p_action: string; p_input: Json };
        Returns: Json;
      };
      quotation_share_pdf_attachments: {
        Args: { p_token: string };
        Returns: Json;
      };
      quotation_shared_revisions: {
        Args: { p_organization_id: string; p_revision_ids: string[] };
        Returns: string[];
      };
      quotation_signing_preflight: {
        Args: { p_message: string; p_signature: string };
        Returns: boolean;
      };
      report_read: {
        Args: { p_organization_id: string; p_kind: string; p_filters: Json };
        Returns: Json;
      };
      report_snapshot_create: {
        Args: { p_organization_id: string; p_kind: string; p_filters: Json };
        Returns: string;
      };
      report_snapshot_history: {
        Args: { p_organization_id: string; p_kind: string; p_page?: number };
        Returns: Json;
      };
      report_snapshot_read: {
        Args: { p_organization_id: string; p_id: string };
        Returns: Json;
      };
      save_branch: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      save_catalog_entity: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_input: Json;
          p_replace_id?: string;
          p_replace_version?: number;
        };
        Returns: string;
      };
      save_commercial_entity: {
        Args: { p_organization_id: string; p_entity: string; p_input: Json };
        Returns: string;
      };
      save_role: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      set_member_role: {
        Args: {
          p_organization_id: string;
          p_membership_id: string;
          p_role_id: string;
          p_branch_id?: string;
          p_remove?: boolean;
        };
        Returns: undefined;
      };
      set_membership_status: {
        Args: {
          p_organization_id: string;
          p_membership_id: string;
          p_status: string;
        };
        Returns: undefined;
      };
      set_rate_status: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_status: string;
        };
        Returns: undefined;
      };
      staff_payment_proof_decide: {
        Args: {
          p_org: string;
          p_proof: string;
          p_action: string;
          p_method?: string;
          p_confirm_bank_credit?: boolean;
          p_allow_partial?: boolean;
          p_note?: string;
        };
        Returns: Json;
      };
      staff_payment_proof_list: {
        Args: { p_org: string; p_contract?: string };
        Returns: Json;
      };
      staff_payment_proof_media: {
        Args: { p_org: string; p_proof: string };
        Returns: Json;
      };
      website_asset_manage: {
        Args: {
          p_organization_id: string;
          p_asset_id: string;
          p_version: number;
          p_name: string;
          p_alt: string;
          p_archive?: boolean;
        };
        Returns: undefined;
      };
      website_asset_public: {
        Args: { p_hostname: string; p_asset_id: string };
        Returns: Json;
      };
      website_asset_read: {
        Args: { p_organization_id: string; p_asset_id: string };
        Returns: Json;
      };
      website_asset_save: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_proof: string;
          p_signature: string;
          p_data: string;
        };
        Returns: string;
      };
      website_assign: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_user_id: string;
          p_active: boolean;
        };
        Returns: undefined;
      };
      website_configuration: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      website_create: {
        Args: {
          p_organization_id: string;
          p_name: string;
          p_slug: string;
          p_document: Json;
        };
        Returns: string;
      };
      website_domain_add: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_hostname: string;
        };
        Returns: string;
      };
      website_domain_check: {
        Args: {
          p_organization_id: string;
          p_domain_id: string;
          p_proof: string;
          p_signature: string;
        };
        Returns: string;
      };
      website_domain_remove: {
        Args: {
          p_organization_id: string;
          p_domain_id: string;
          p_version: number;
        };
        Returns: undefined;
      };
      website_from_template: {
        Args: {
          p_organization_id: string;
          p_template_id: string;
          p_name: string;
          p_slug: string;
          p_empty_document: Json;
        };
        Returns: string;
      };
      website_grant_developer: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      website_metrics_read: {
        Args: { p_organization_id: string; p_website_id: string };
        Returns: Json;
      };
      website_platform_domain_registry: {
        Args: { p_page?: number };
        Returns: Json;
      };
      website_platform_list: { Args: { p_page?: number }; Returns: Json };
      website_platform_update: {
        Args: { p_operation: string; p_input: Json };
        Returns: undefined;
      };
      website_prepare_crm: {
        Args: { p_organization_id: string; p_website_id: string };
        Returns: undefined;
      };
      website_public: { Args: { p_hostname: string }; Returns: Json };
      website_publish: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_version: number;
          p_build_text: string;
          p_signature: string;
          p_summary: string;
          p_restore_id?: string;
        };
        Returns: string;
      };
      website_read: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_version_id?: string;
        };
        Returns: Json;
      };
      website_record_view: {
        Args: { p_hostname: string; p_path: string };
        Returns: undefined;
      };
      website_save: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_version: number;
          p_section: string;
          p_value: Json;
        };
        Returns: number;
      };
      website_source_choices: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_kind: string;
          p_query?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      website_status: {
        Args: {
          p_organization_id: string;
          p_website_id: string;
          p_version: number;
          p_status: string;
        };
        Returns: undefined;
      };
      website_submit_lead: {
        Args: {
          p_hostname: string;
          p_page: string;
          p_form: string;
          p_values: Json;
          p_honeypot?: string;
          p_attribution?: Json;
        };
        Returns: Json;
      };
      website_team_choices: {
        Args: { p_organization_id: string; p_website_id: string };
        Returns: Json;
      };
      website_template_save: {
        Args: {
          p_id: string;
          p_version: number;
          p_name: string;
          p_description: string;
          p_document: Json;
        };
        Returns: string;
      };
      website_template_status: {
        Args: {
          p_id: string;
          p_version: number;
          p_status: string;
          p_proof?: string;
          p_signature?: string;
        };
        Returns: number;
      };
      whatsapp_automation_finish: {
        Args: {
          p_organization_id: string;
          p_run_id: string;
          p_status: string;
          p_provider_id?: string;
          p_error?: string;
        };
        Returns: undefined;
      };
      whatsapp_automation_match: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_message_id: string;
          p_wa_id: string;
          p_text: string;
        };
        Returns: Json;
      };
      whatsapp_automation_save: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_input: Json;
        };
        Returns: Json;
      };
      whatsapp_connection_save: {
        Args: {
          p_organization_id: string;
          p_waba_id: string;
          p_business_name: string;
          p_phone_number_id: string;
          p_display_phone_number: string;
          p_verified_name: string;
          p_token_ciphertext: string;
          p_token_iv: string;
          p_token_tag: string;
        };
        Returns: string;
      };
      whatsapp_contact_create: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_wa_id: string;
          p_display_name: string;
          p_consent_source: string;
        };
        Returns: string;
      };
      whatsapp_contact_opted_out: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_wa_id: string;
        };
        Returns: boolean;
      };
      whatsapp_contact_state: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_wa_id: string;
          p_action: string;
        };
        Returns: undefined;
      };
      whatsapp_contact_template_opted_in: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_wa_id: string;
        };
        Returns: boolean;
      };
      whatsapp_message_ingest: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_change: Json;
        };
        Returns: number;
      };
      whatsapp_message_log_outbound: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_to: string;
          p_provider_id: string;
          p_body: string;
          p_type?: string;
        };
        Returns: string;
      };
      whatsapp_window_open: {
        Args: {
          p_organization_id: string;
          p_connection_id: string;
          p_wa_id: string;
        };
        Returns: boolean;
      };
      whatsapp_workspace_read: {
        Args: {
          p_organization_id: string;
          p_section?: string;
          p_connection_id?: string;
          p_wa_id?: string;
          p_search?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      work_queue: {
        Args: { p_organization_id: string; p_group?: string; p_page?: number };
        Returns: Json;
      };
      workspace_organization_for_hostname: {
        Args: { p_hostname: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
