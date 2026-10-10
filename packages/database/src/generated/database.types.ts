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
      contracts: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string;
          project_id: string;
          revision_id: string;
          acceptance_id: string;
          lead_id: string | null;
          branch_id: string | null;
          contract_number: string;
          currency: string;
          precision: number;
          original_contract_value: string;
          source_snapshot: Json;
          status: string;
          version: number;
          accepted_at: string;
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
          acceptance_id: string;
          lead_id?: string | null;
          branch_id?: string | null;
          contract_number: string;
          currency: string;
          precision: number;
          original_contract_value: string;
          source_snapshot: Json;
          status?: string;
          version?: number;
          accepted_at: string;
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
          acceptance_id?: string;
          lead_id?: string | null;
          branch_id?: string | null;
          contract_number?: string;
          currency?: string;
          precision?: number;
          original_contract_value?: string;
          source_snapshot?: Json;
          status?: string;
          version?: number;
          accepted_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          closed_at?: string | null;
          cancelled_at?: string | null;
          status_reason?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contracts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_acceptance_id_fkey';
            columns: ['organization_id', 'acceptance_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_customer_responses';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_branch_id_fkey';
            columns: ['organization_id', 'branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_customer_id_project_id_fkey';
            columns: ['organization_id', 'customer_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'customer_id', 'id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_lead_id_fkey';
            columns: ['organization_id', 'lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'contracts_organization_id_revision_id_project_id_fkey';
            columns: ['organization_id', 'revision_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_revisions';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
        ];
      };
      crm_lost_reasons: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          active: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name: string;
          key: string;
          active?: boolean;
          sort_order?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name?: string;
          key?: string;
          active?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'crm_lost_reasons_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crm_lost_reasons_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      crm_pipeline_stages: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          active: boolean;
          sort_order: number;
          outcome: string;
          is_terminal: boolean | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name: string;
          key: string;
          active?: boolean;
          sort_order?: number;
          outcome?: string;
          is_terminal?: boolean | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name?: string;
          key?: string;
          active?: boolean;
          sort_order?: number;
          outcome?: string;
          is_terminal?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'crm_pipeline_stages_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crm_pipeline_stages_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      crm_requirement_fields: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          active: boolean;
          sort_order: number;
          industry_id: string | null;
          field_type: string;
          options: Json;
          required: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name: string;
          key: string;
          active?: boolean;
          sort_order?: number;
          industry_id?: string | null;
          field_type: string;
          options?: Json;
          required?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name?: string;
          key?: string;
          active?: boolean;
          sort_order?: number;
          industry_id?: string | null;
          field_type?: string;
          options?: Json;
          required?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'crm_requirement_fields_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crm_requirement_fields_industry_id_fkey';
            columns: ['industry_id'];
            isOneToOne: false;
            referencedRelation: 'industries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crm_requirement_fields_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_contacts: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          customer_id: string;
          name: string;
          role: string;
          phone: string;
          email: string;
          is_primary: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          customer_id: string;
          name: string;
          role?: string;
          phone?: string;
          email?: string;
          is_primary?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          customer_id?: string;
          name?: string;
          role?: string;
          phone?: string;
          email?: string;
          is_primary?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_contacts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_contacts_organization_id_customer_id_fkey';
            columns: ['organization_id', 'customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'customer_contacts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          status: string;
          customer_type: string;
          display_name: string;
          legal_name: string;
          phone: string;
          secondary_phone: string;
          email: string;
          tax_identifier: string;
          billing_address: Json;
          notes: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          status?: string;
          customer_type?: string;
          display_name: string;
          legal_name?: string;
          phone?: string;
          secondary_phone?: string;
          email?: string;
          tax_identifier?: string;
          billing_address?: Json;
          notes?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          status?: string;
          customer_type?: string;
          display_name?: string;
          legal_name?: string;
          phone?: string;
          secondary_phone?: string;
          email?: string;
          tax_identifier?: string;
          billing_address?: Json;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customers_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      email_deliveries: {
        Row: {
          id: string;
          organization_id: string;
          job_id: string;
          event_id: string;
          recipient_id: string | null;
          customer_id: string | null;
          template_key: string;
          status: string;
          attempts: number;
          lease_token: string | null;
          lease_until: string | null;
          next_attempt_at: string;
          provider_message_id: string | null;
          error_code: string;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          job_id: string;
          event_id: string;
          recipient_id?: string | null;
          customer_id?: string | null;
          template_key: string;
          status?: string;
          attempts?: number;
          lease_token?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string;
          provider_message_id?: string | null;
          error_code?: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          job_id?: string;
          event_id?: string;
          recipient_id?: string | null;
          customer_id?: string | null;
          template_key?: string;
          status?: string;
          attempts?: number;
          lease_token?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string;
          provider_message_id?: string | null;
          error_code?: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_deliveries_organization_id_customer_id_fkey';
            columns: ['organization_id', 'customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'email_deliveries_organization_id_event_id_fkey';
            columns: ['organization_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'automation_events';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'email_deliveries_organization_id_job_id_fkey';
            columns: ['organization_id', 'job_id'];
            isOneToOne: false;
            referencedRelation: 'automation_jobs';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'email_deliveries_organization_id_recipient_id_fkey';
            columns: ['organization_id', 'recipient_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
        ];
      };
      email_templates: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          subject: string;
          body: string;
          version: number;
          updated_by: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          subject: string;
          body: string;
          version?: number;
          updated_by: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          key?: string;
          subject?: string;
          body?: string;
          version?: number;
          updated_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_templates_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_templates_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      estimation_recipe_item_costs: {
        Row: {
          id: string;
          organization_id: string;
          recipe_item_id: string;
          currency: string;
          unit_cost: string;
          source_reference: string;
          effective_date: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          recipe_item_id: string;
          currency: string;
          unit_cost: string;
          source_reference: string;
          effective_date: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          recipe_item_id?: string;
          currency?: string;
          unit_cost?: string;
          source_reference?: string;
          effective_date?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'estimation_recipe_item_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'estimation_recipe_item_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'estimation_recipe_item_costs_organization_id_recipe_item_i_fkey';
            columns: ['organization_id', 'recipe_item_id'];
            isOneToOne: false;
            referencedRelation: 'estimation_recipe_items';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      estimation_recipe_items: {
        Row: {
          id: string;
          organization_id: string;
          recipe_id: string;
          variant_id: string | null;
          category_id: string | null;
          cost_kind: string;
          description: string;
          unit: string;
          rule: Json;
          waste_percentage: string | null;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          active: boolean;
          version: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          recipe_id: string;
          variant_id?: string | null;
          category_id?: string | null;
          cost_kind: string;
          description?: string;
          unit?: string;
          rule: Json;
          waste_percentage?: string | null;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          active?: boolean;
          version?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          recipe_id?: string;
          variant_id?: string | null;
          category_id?: string | null;
          cost_kind?: string;
          description?: string;
          unit?: string;
          rule?: Json;
          waste_percentage?: string | null;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          active?: boolean;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'estimation_recipe_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'estimation_recipe_items_organization_id_category_id_fkey';
            columns: ['organization_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'material_categories';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'estimation_recipe_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'estimation_recipe_items_organization_id_recipe_id_fkey';
            columns: ['organization_id', 'recipe_id'];
            isOneToOne: false;
            referencedRelation: 'estimation_recipes';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'estimation_recipe_items_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      estimation_recipes: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          matching: Json;
          override_reason_required: boolean;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string;
          matching?: Json;
          override_reason_required?: boolean;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string;
          matching?: Json;
          override_reason_required?: boolean;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'estimation_recipes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'estimation_recipes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      execution_estimate_documents: {
        Row: {
          id: string;
          organization_id: string;
          revision_id: string;
          document_snapshot: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          revision_id: string;
          document_snapshot: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          revision_id?: string;
          document_snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_estimate_documents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_documents_organization_id_revision_id_fkey';
            columns: ['organization_id', 'revision_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_revisions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      execution_estimate_line_costs: {
        Row: {
          id: string;
          organization_id: string;
          line_id: string;
          revision_id: string;
          currency: string;
          unit_cost: string;
          estimated_cost: string;
          waste_cost: string;
          rate_snapshot: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          line_id: string;
          revision_id: string;
          currency: string;
          unit_cost: string;
          estimated_cost: string;
          waste_cost: string;
          rate_snapshot: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          line_id?: string;
          revision_id?: string;
          currency?: string;
          unit_cost?: string;
          estimated_cost?: string;
          waste_cost?: string;
          rate_snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_estimate_line_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_line_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_line_costs_organization_id_revision_id__fkey';
            columns: ['organization_id', 'revision_id', 'line_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_lines';
            referencedColumns: ['organization_id', 'revision_id', 'id'];
          },
        ];
      };
      execution_estimate_lines: {
        Row: {
          id: string;
          organization_id: string;
          revision_id: string;
          scope_id: string;
          variant_id: string | null;
          category_id: string | null;
          cost_kind: string;
          description: string;
          accuracy: string;
          method: string;
          recipe_item_id: string | null;
          purchase_unit: string;
          consumption_unit: string;
          base_quantity: string;
          waste_quantity: string;
          required_quantity: string;
          calculated_purchase_quantity: string;
          rounded_purchase_quantity: string;
          override_quantity: string | null;
          planned_purchase_quantity: string;
          override_reason: string;
          calculation_snapshot: Json;
          drawing_reference: string;
          measurement_note: string;
          site_measurement_version: string;
          notes: string;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          revision_id: string;
          scope_id: string;
          variant_id?: string | null;
          category_id?: string | null;
          cost_kind: string;
          description?: string;
          accuracy?: string;
          method: string;
          recipe_item_id?: string | null;
          purchase_unit: string;
          consumption_unit: string;
          base_quantity: string;
          waste_quantity: string;
          required_quantity: string;
          calculated_purchase_quantity: string;
          rounded_purchase_quantity: string;
          override_quantity?: string | null;
          planned_purchase_quantity: string;
          override_reason?: string;
          calculation_snapshot: Json;
          drawing_reference?: string;
          measurement_note?: string;
          site_measurement_version?: string;
          notes?: string;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          revision_id?: string;
          scope_id?: string;
          variant_id?: string | null;
          category_id?: string | null;
          cost_kind?: string;
          description?: string;
          accuracy?: string;
          method?: string;
          recipe_item_id?: string | null;
          purchase_unit?: string;
          consumption_unit?: string;
          base_quantity?: string;
          waste_quantity?: string;
          required_quantity?: string;
          calculated_purchase_quantity?: string;
          rounded_purchase_quantity?: string;
          override_quantity?: string | null;
          planned_purchase_quantity?: string;
          override_reason?: string;
          calculation_snapshot?: Json;
          drawing_reference?: string;
          measurement_note?: string;
          site_measurement_version?: string;
          notes?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_estimate_lines_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_lines_organization_id_category_id_fkey';
            columns: ['organization_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'material_categories';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_lines_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_lines_organization_id_recipe_item_id_fkey';
            columns: ['organization_id', 'recipe_item_id'];
            isOneToOne: false;
            referencedRelation: 'estimation_recipe_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_lines_organization_id_revision_id_scope_fkey';
            columns: ['organization_id', 'revision_id', 'scope_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_scope_items';
            referencedColumns: ['organization_id', 'revision_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_lines_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      execution_estimate_revisions: {
        Row: {
          id: string;
          organization_id: string;
          estimate_id: string;
          contract_id: string;
          project_id: string;
          revision_number: number;
          status: string;
          scope_fingerprint: string;
          notes: string;
          version: number;
          reviewed_by: string | null;
          approved_by: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          decision_reason: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          estimate_id: string;
          contract_id: string;
          project_id: string;
          revision_number: number;
          status?: string;
          scope_fingerprint: string;
          notes?: string;
          version?: number;
          reviewed_by?: string | null;
          approved_by?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          decision_reason?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          estimate_id?: string;
          contract_id?: string;
          project_id?: string;
          revision_number?: number;
          status?: string;
          scope_fingerprint?: string;
          notes?: string;
          version?: number;
          reviewed_by?: string | null;
          approved_by?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          decision_reason?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_estimate_revisions_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_revisions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_revisions_organization_id_contract_id_e_fkey';
            columns: ['organization_id', 'contract_id', 'estimate_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimates';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_revisions_organization_id_contract_id_p_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'execution_estimate_revisions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_revisions_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      execution_estimate_scope_items: {
        Row: {
          id: string;
          organization_id: string;
          revision_id: string;
          contract_id: string;
          source_type: string;
          source_id: string;
          area_id: string | null;
          area_name: string;
          snapshot: Json;
          coverage: string;
          exclusion_reason: string;
          suggested_recipe_id: string | null;
          selected_recipe_id: string | null;
          recipe_reason: string;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          revision_id: string;
          contract_id: string;
          source_type: string;
          source_id: string;
          area_id?: string | null;
          area_name?: string;
          snapshot: Json;
          coverage?: string;
          exclusion_reason?: string;
          suggested_recipe_id?: string | null;
          selected_recipe_id?: string | null;
          recipe_reason?: string;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          revision_id?: string;
          contract_id?: string;
          source_type?: string;
          source_id?: string;
          area_id?: string | null;
          area_name?: string;
          snapshot?: Json;
          coverage?: string;
          exclusion_reason?: string;
          suggested_recipe_id?: string | null;
          selected_recipe_id?: string | null;
          recipe_reason?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_estimate_scope_item_organization_id_contract_id__fkey';
            columns: ['organization_id', 'contract_id', 'revision_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_revisions';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_scope_item_organization_id_selected_rec_fkey';
            columns: ['organization_id', 'selected_recipe_id'];
            isOneToOne: false;
            referencedRelation: 'estimation_recipes';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_scope_item_organization_id_suggested_re_fkey';
            columns: ['organization_id', 'suggested_recipe_id'];
            isOneToOne: false;
            referencedRelation: 'estimation_recipes';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_scope_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimate_scope_items_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimate_scope_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      execution_estimates: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          estimate_number: string;
          next_revision: number;
          current_approved_revision_id: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          estimate_number: string;
          next_revision?: number;
          current_approved_revision_id?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          project_id?: string;
          estimate_number?: string;
          next_revision?: number;
          current_approved_revision_id?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_estimates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_estimates_organization_id_contract_id_current_ap_fkey';
            columns: [
              'organization_id',
              'contract_id',
              'current_approved_revision_id',
            ];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_revisions';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'execution_estimates_organization_id_contract_id_project_id_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'execution_estimates_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      execution_plan_revisions: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          revision_number: number;
          estimate_revision_id: string;
          status: string;
          scope_fingerprint: string;
          snapshot: Json | null;
          notes: string;
          approved_by: string | null;
          approved_at: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          revision_number: number;
          estimate_revision_id: string;
          status?: string;
          scope_fingerprint: string;
          snapshot?: Json | null;
          notes?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          plan_id?: string;
          revision_number?: number;
          estimate_revision_id?: string;
          status?: string;
          scope_fingerprint?: string;
          snapshot?: Json | null;
          notes?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_plan_revisions_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_plan_revisions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_plan_revisions_organization_id_estimate_revision_fkey';
            columns: ['organization_id', 'estimate_revision_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_revisions';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_plan_revisions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_plan_revisions_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'execution_plan_revisions_organization_id_project_id_plan_i_fkey';
            columns: ['organization_id', 'project_id', 'plan_id'];
            isOneToOne: false;
            referencedRelation: 'execution_plans';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      execution_plans: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          contract_id: string;
          plan_number: string;
          status: string;
          manager_id: string | null;
          notes: string;
          planned_start: string | null;
          planned_end: string | null;
          actual_start: string | null;
          actual_end: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          contract_id: string;
          plan_number: string;
          status?: string;
          manager_id?: string | null;
          notes?: string;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          contract_id?: string;
          plan_number?: string;
          status?: string;
          manager_id?: string | null;
          notes?: string;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'execution_plans_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_plans_organization_id_contract_id_project_id_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'execution_plans_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'execution_plans_organization_id_manager_id_fkey';
            columns: ['organization_id', 'manager_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'execution_plans_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      goods_receipt_items: {
        Row: {
          id: string;
          organization_id: string;
          receipt_id: string;
          po_id: string;
          po_item_id: string;
          received_quantity: string;
          accepted_quantity: string;
          rejected_quantity: string;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          receipt_id: string;
          po_id: string;
          po_item_id: string;
          received_quantity: string;
          accepted_quantity: string;
          rejected_quantity: string;
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          receipt_id?: string;
          po_id?: string;
          po_item_id?: string;
          received_quantity?: string;
          accepted_quantity?: string;
          rejected_quantity?: string;
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goods_receipt_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipt_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipt_items_organization_id_po_id_po_item_id_fkey';
            columns: ['organization_id', 'po_id', 'po_item_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_order_items';
            referencedColumns: ['organization_id', 'po_id', 'id'];
          },
          {
            foreignKeyName: 'goods_receipt_items_organization_id_po_id_receipt_id_fkey';
            columns: ['organization_id', 'po_id', 'receipt_id'];
            isOneToOne: false;
            referencedRelation: 'goods_receipts';
            referencedColumns: ['organization_id', 'po_id', 'id'];
          },
        ];
      };
      goods_receipts: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          po_id: string;
          receipt_number: string;
          receipt_date: string;
          supplier_reference: string;
          notes: string;
          idempotency_key: string;
          request_hash: string;
          document_snapshot: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          po_id: string;
          receipt_number: string;
          receipt_date: string;
          supplier_reference?: string;
          notes?: string;
          idempotency_key: string;
          request_hash: string;
          document_snapshot: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          project_id?: string;
          po_id?: string;
          receipt_number?: string;
          receipt_date?: string;
          supplier_reference?: string;
          notes?: string;
          idempotency_key?: string;
          request_hash?: string;
          document_snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goods_receipts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipts_organization_id_contract_id_po_id_fkey';
            columns: ['organization_id', 'contract_id', 'po_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'goods_receipts_organization_id_contract_id_project_id_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'goods_receipts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      handover_records: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          template_id: string;
          number: string;
          status: string;
          checklist: Json;
          customer_notes: string;
          internal_notes: string;
          acknowledgement: string;
          commercial_review: string;
          materials_review: string;
          handover_date: string;
          warranty_start: string | null;
          warranty_end: string | null;
          approved_by: string | null;
          approved_at: string | null;
          document_snapshot: Json | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          template_id: string;
          number: string;
          status?: string;
          checklist: Json;
          customer_notes?: string;
          internal_notes?: string;
          acknowledgement?: string;
          commercial_review?: string;
          materials_review?: string;
          handover_date?: string;
          warranty_start?: string | null;
          warranty_end?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          document_snapshot?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          plan_id?: string;
          template_id?: string;
          number?: string;
          status?: string;
          checklist?: Json;
          customer_notes?: string;
          internal_notes?: string;
          acknowledgement?: string;
          commercial_review?: string;
          materials_review?: string;
          handover_date?: string;
          warranty_start?: string | null;
          warranty_end?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          document_snapshot?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'handover_records_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'handover_records_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'handover_records_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'handover_records_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'handover_records_organization_id_project_id_plan_id_fkey';
            columns: ['organization_id', 'project_id', 'plan_id'];
            isOneToOne: false;
            referencedRelation: 'execution_plans';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'handover_records_organization_id_template_id_fkey';
            columns: ['organization_id', 'template_id'];
            isOneToOne: false;
            referencedRelation: 'handover_templates';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      handover_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          active: boolean;
          checklist: Json;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          active?: boolean;
          checklist: Json;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          active?: boolean;
          checklist?: Json;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'handover_templates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'handover_templates_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      industries: {
        Row: {
          id: string;
          key: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inspection_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          kind: string;
          is_final: boolean;
          mandatory: boolean;
          active: boolean;
          checklist: Json;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          kind?: string;
          is_final?: boolean;
          mandatory?: boolean;
          active?: boolean;
          checklist: Json;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          kind?: string;
          is_final?: boolean;
          mandatory?: boolean;
          active?: boolean;
          checklist?: Json;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inspection_templates_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inspection_templates_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_counts: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          lot_id: string;
          system_quantity: string;
          physical_quantity: string;
          transaction_id: string | null;
          reason: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          location_id: string;
          lot_id: string;
          system_quantity: string;
          physical_quantity: string;
          transaction_id?: string | null;
          reason: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          location_id?: string;
          lot_id?: string;
          system_quantity?: string;
          physical_quantity?: string;
          transaction_id?: string | null;
          reason?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_counts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_counts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_counts_organization_id_location_id_fkey';
            columns: ['organization_id', 'location_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_locations';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_counts_organization_id_lot_id_fkey';
            columns: ['organization_id', 'lot_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_lots';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_counts_organization_id_transaction_id_fkey';
            columns: ['organization_id', 'transaction_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_transactions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      inventory_locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          kind: string;
          site_project_id: string | null;
          active: boolean;
          notes: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          kind: string;
          site_project_id?: string | null;
          active?: boolean;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          kind?: string;
          site_project_id?: string | null;
          active?: boolean;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_locations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_locations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_locations_organization_id_site_project_id_fkey';
            columns: ['organization_id', 'site_project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      inventory_lot_costs: {
        Row: {
          id: string;
          organization_id: string;
          lot_id: string;
          currency: string;
          total_cost: string;
          precision: number;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lot_id: string;
          currency: string;
          total_cost: string;
          precision: number;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lot_id?: string;
          currency?: string;
          total_cost?: string;
          precision?: number;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_lot_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_lot_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_lot_costs_organization_id_lot_id_fkey';
            columns: ['organization_id', 'lot_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_lots';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      inventory_lots: {
        Row: {
          id: string;
          organization_id: string;
          receipt_item_id: string;
          variant_id: string;
          unit: string;
          received_quantity: string;
          label: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          receipt_item_id: string;
          variant_id: string;
          unit: string;
          received_quantity: string;
          label: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          receipt_item_id?: string;
          variant_id?: string;
          unit?: string;
          received_quantity?: string;
          label?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_lots_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_lots_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_lots_organization_id_receipt_item_id_fkey';
            columns: ['organization_id', 'receipt_item_id'];
            isOneToOne: false;
            referencedRelation: 'goods_receipt_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_lots_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string | null;
          transaction_id: string;
          lot_id: string;
          location_id: string;
          quantity: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id?: string | null;
          transaction_id: string;
          lot_id: string;
          location_id: string;
          quantity: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string | null;
          transaction_id?: string;
          lot_id?: string;
          location_id?: string;
          quantity?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_movements_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_movements_organization_id_location_id_fkey';
            columns: ['organization_id', 'location_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_locations';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_movements_organization_id_lot_id_fkey';
            columns: ['organization_id', 'lot_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_lots';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_movements_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_movements_organization_id_transaction_id_fkey';
            columns: ['organization_id', 'transaction_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_transactions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      inventory_transactions: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string | null;
          number: string;
          kind: string;
          source_location_id: string | null;
          destination_location_id: string | null;
          request_item_id: string | null;
          original_transaction_id: string | null;
          area_id: string | null;
          task_id: string | null;
          work_package_id: string | null;
          estimate_line_id: string | null;
          movement_date: string;
          reason: string;
          received_by: string;
          idempotency_key: string;
          request_hash: string;
          document_snapshot: Json;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id?: string | null;
          number: string;
          kind: string;
          source_location_id?: string | null;
          destination_location_id?: string | null;
          request_item_id?: string | null;
          original_transaction_id?: string | null;
          area_id?: string | null;
          task_id?: string | null;
          work_package_id?: string | null;
          estimate_line_id?: string | null;
          movement_date?: string;
          reason: string;
          received_by?: string;
          idempotency_key: string;
          request_hash: string;
          document_snapshot: Json;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string | null;
          number?: string;
          kind?: string;
          source_location_id?: string | null;
          destination_location_id?: string | null;
          request_item_id?: string | null;
          original_transaction_id?: string | null;
          area_id?: string | null;
          task_id?: string | null;
          work_package_id?: string | null;
          estimate_line_id?: string | null;
          movement_date?: string;
          reason?: string;
          received_by?: string;
          idempotency_key?: string;
          request_hash?: string;
          document_snapshot?: Json;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_transactions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_destination_locatio_fkey';
            columns: ['organization_id', 'destination_location_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_locations';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_estimate_line_id_fkey';
            columns: ['organization_id', 'estimate_line_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_lines';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_original_transactio_fkey';
            columns: ['organization_id', 'original_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_transactions';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_request_item_id_fkey';
            columns: ['organization_id', 'request_item_id'];
            isOneToOne: false;
            referencedRelation: 'material_issue_request_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_source_location_id_fkey';
            columns: ['organization_id', 'source_location_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_locations';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_task_id_fkey';
            columns: ['organization_id', 'task_id'];
            isOneToOne: false;
            referencedRelation: 'project_tasks';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'inventory_transactions_organization_id_work_package_id_fkey';
            columns: ['organization_id', 'work_package_id'];
            isOneToOne: false;
            referencedRelation: 'work_packages';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      invoice_items: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          invoice_id: string;
          description: string;
          quantity: string;
          unit: string;
          unit_rate: string;
          discount: string;
          line_amount: string;
          taxable_amount: string;
          tax_amount: string;
          total: string;
          tax_code_id: string | null;
          tax_snapshot: Json;
          hsn_sac: string;
          source_type: string;
          source_id: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          invoice_id: string;
          description: string;
          quantity: string;
          unit: string;
          unit_rate: string;
          discount?: string;
          line_amount: string;
          taxable_amount: string;
          tax_amount: string;
          total: string;
          tax_code_id?: string | null;
          tax_snapshot?: Json;
          hsn_sac?: string;
          source_type: string;
          source_id?: string | null;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          invoice_id?: string;
          description?: string;
          quantity?: string;
          unit?: string;
          unit_rate?: string;
          discount?: string;
          line_amount?: string;
          taxable_amount?: string;
          tax_amount?: string;
          total?: string;
          tax_code_id?: string | null;
          tax_snapshot?: Json;
          hsn_sac?: string;
          source_type?: string;
          source_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_items_organization_id_contract_id_invoice_id_fkey';
            columns: ['organization_id', 'contract_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'invoice_items_organization_id_tax_code_id_fkey';
            columns: ['organization_id', 'tax_code_id'];
            isOneToOne: false;
            referencedRelation: 'tax_codes';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          customer_id: string;
          project_id: string;
          invoice_number: string | null;
          invoice_type: string;
          currency: string;
          status: string;
          version: number;
          issue_date: string;
          due_date: string | null;
          tax_mode: string;
          tax_application: string;
          tax_code_id: string | null;
          tax_snapshot: Json;
          place_of_supply: string;
          billing_state: string;
          subtotal: string;
          discount: string;
          taxable_amount: string;
          tax_amount: string;
          total: string;
          document_snapshot: Json | null;
          notes: string;
          terms: string;
          issued_at: string | null;
          issued_by: string | null;
          voided_at: string | null;
          void_reason: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          customer_id: string;
          project_id: string;
          invoice_number?: string | null;
          invoice_type: string;
          currency: string;
          status?: string;
          version?: number;
          issue_date: string;
          due_date?: string | null;
          tax_mode: string;
          tax_application: string;
          tax_code_id?: string | null;
          tax_snapshot?: Json;
          place_of_supply?: string;
          billing_state?: string;
          subtotal?: string;
          discount?: string;
          taxable_amount?: string;
          tax_amount?: string;
          total?: string;
          document_snapshot?: Json | null;
          notes?: string;
          terms?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          voided_at?: string | null;
          void_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          customer_id?: string;
          project_id?: string;
          invoice_number?: string | null;
          invoice_type?: string;
          currency?: string;
          status?: string;
          version?: number;
          issue_date?: string;
          due_date?: string | null;
          tax_mode?: string;
          tax_application?: string;
          tax_code_id?: string | null;
          tax_snapshot?: Json;
          place_of_supply?: string;
          billing_state?: string;
          subtotal?: string;
          discount?: string;
          taxable_amount?: string;
          tax_amount?: string;
          total?: string;
          document_snapshot?: Json | null;
          notes?: string;
          terms?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          voided_at?: string | null;
          void_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_organization_id_contract_id_customer_id_project_i_fkey';
            columns: [
              'organization_id',
              'contract_id',
              'customer_id',
              'project_id',
            ];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: [
              'organization_id',
              'id',
              'customer_id',
              'project_id',
            ];
          },
          {
            foreignKeyName: 'invoices_organization_id_tax_code_id_fkey';
            columns: ['organization_id', 'tax_code_id'];
            isOneToOne: false;
            referencedRelation: 'tax_codes';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      lead_activities: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          lead_id: string;
          activity_type: string;
          subject: string;
          body: string;
          occurred_at: string;
          system_generated: boolean;
          metadata: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_id: string;
          activity_type: string;
          subject?: string;
          body?: string;
          occurred_at?: string;
          system_generated?: boolean;
          metadata?: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_id?: string;
          activity_type?: string;
          subject?: string;
          body?: string;
          occurred_at?: string;
          system_generated?: boolean;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'lead_activities_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_activities_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_activities_organization_id_lead_id_fkey';
            columns: ['organization_id', 'lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      lead_followups: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          lead_id: string;
          assigned_to: string;
          due_at: string;
          followup_type: string;
          note: string;
          status: string;
          completed_at: string | null;
          completed_by: string | null;
          outcome: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_id: string;
          assigned_to: string;
          due_at: string;
          followup_type: string;
          note?: string;
          status?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          outcome?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_id?: string;
          assigned_to?: string;
          due_at?: string;
          followup_type?: string;
          note?: string;
          status?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          outcome?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lead_followups_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_followups_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_followups_organization_id_assigned_to_fkey';
            columns: ['organization_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'lead_followups_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_followups_organization_id_lead_id_fkey';
            columns: ['organization_id', 'lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      lead_sources: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          active: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name: string;
          key: string;
          active?: boolean;
          sort_order?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name?: string;
          key?: string;
          active?: boolean;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'lead_sources_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lead_sources_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          lead_number: string;
          name: string;
          company_name: string;
          phone: string;
          secondary_phone: string;
          phone_normalized: string | null;
          email: string;
          email_normalized: string | null;
          source_id: string;
          source_detail: string;
          stage_id: string;
          stage_entered_at: string;
          lifecycle: string;
          branch_id: string | null;
          industry_id: string | null;
          service_type: string;
          location: string;
          site_address: Json;
          budget_min: number | null;
          budget_max: number | null;
          expected_start_date: string | null;
          project_size: string;
          assigned_to: string | null;
          priority: string;
          next_follow_up_at: string | null;
          notes: string;
          requirements: Json;
          lost_reason_id: string | null;
          outcome_note: string;
          lost_at: string | null;
          lost_by: string | null;
          won_at: string | null;
          won_by: string | null;
          converted_customer_id: string | null;
          converted_project_id: string | null;
          converted_at: string | null;
          converted_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_number: string;
          name: string;
          company_name?: string;
          phone: string;
          secondary_phone?: string;
          phone_normalized?: string | null;
          email?: string;
          email_normalized?: string | null;
          source_id: string;
          source_detail?: string;
          stage_id: string;
          stage_entered_at?: string;
          lifecycle?: string;
          branch_id?: string | null;
          industry_id?: string | null;
          service_type?: string;
          location?: string;
          site_address?: Json;
          budget_min?: number | null;
          budget_max?: number | null;
          expected_start_date?: string | null;
          project_size?: string;
          assigned_to?: string | null;
          priority?: string;
          next_follow_up_at?: string | null;
          notes?: string;
          requirements?: Json;
          lost_reason_id?: string | null;
          outcome_note?: string;
          lost_at?: string | null;
          lost_by?: string | null;
          won_at?: string | null;
          won_by?: string | null;
          converted_customer_id?: string | null;
          converted_project_id?: string | null;
          converted_at?: string | null;
          converted_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_number?: string;
          name?: string;
          company_name?: string;
          phone?: string;
          secondary_phone?: string;
          phone_normalized?: string | null;
          email?: string;
          email_normalized?: string | null;
          source_id?: string;
          source_detail?: string;
          stage_id?: string;
          stage_entered_at?: string;
          lifecycle?: string;
          branch_id?: string | null;
          industry_id?: string | null;
          service_type?: string;
          location?: string;
          site_address?: Json;
          budget_min?: number | null;
          budget_max?: number | null;
          expected_start_date?: string | null;
          project_size?: string;
          assigned_to?: string | null;
          priority?: string;
          next_follow_up_at?: string | null;
          notes?: string;
          requirements?: Json;
          lost_reason_id?: string | null;
          outcome_note?: string;
          lost_at?: string | null;
          lost_by?: string | null;
          won_at?: string | null;
          won_by?: string | null;
          converted_customer_id?: string | null;
          converted_project_id?: string | null;
          converted_at?: string | null;
          converted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'leads_converted_by_fkey';
            columns: ['converted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_industry_id_fkey';
            columns: ['industry_id'];
            isOneToOne: false;
            referencedRelation: 'industries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_lost_by_fkey';
            columns: ['lost_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_organization_id_assigned_to_fkey';
            columns: ['organization_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'leads_organization_id_branch_id_fkey';
            columns: ['organization_id', 'branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'leads_organization_id_converted_customer_id_converted_proj_fkey';
            columns: [
              'organization_id',
              'converted_customer_id',
              'converted_project_id',
            ];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'customer_id', 'id'];
          },
          {
            foreignKeyName: 'leads_organization_id_converted_customer_id_fkey';
            columns: ['organization_id', 'converted_customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'leads_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leads_organization_id_lost_reason_id_fkey';
            columns: ['organization_id', 'lost_reason_id'];
            isOneToOne: false;
            referencedRelation: 'crm_lost_reasons';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'leads_organization_id_source_id_fkey';
            columns: ['organization_id', 'source_id'];
            isOneToOne: false;
            referencedRelation: 'lead_sources';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'leads_organization_id_stage_id_fkey';
            columns: ['organization_id', 'stage_id'];
            isOneToOne: false;
            referencedRelation: 'crm_pipeline_stages';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'leads_won_by_fkey';
            columns: ['won_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      marketing_kits: {
        Row: {
          organization_id: string;
          version: number;
          content: Json;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          version?: number;
          content?: Json;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          version?: number;
          content?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'marketing_kits_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      material_categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          code?: string;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'material_categories_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_categories_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      material_cost_revisions: {
        Row: {
          id: string;
          organization_id: string;
          variant_id: string;
          vendor_id: string | null;
          currency: string;
          unit_cost: string;
          source_reference: string;
          valid_from: string;
          valid_until: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          variant_id: string;
          vendor_id?: string | null;
          currency: string;
          unit_cost: string;
          source_reference: string;
          valid_from: string;
          valid_until?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          variant_id?: string;
          vendor_id?: string | null;
          currency?: string;
          unit_cost?: string;
          source_reference?: string;
          valid_from?: string;
          valid_until?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'material_cost_revisions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_cost_revisions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_cost_revisions_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'material_cost_revisions_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      material_issue_request_items: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          variant_id: string;
          unit: string;
          quantity: string;
          approved_quantity: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          variant_id: string;
          unit: string;
          quantity: string;
          approved_quantity?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          request_id?: string;
          variant_id?: string;
          unit?: string;
          quantity?: string;
          approved_quantity?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'material_issue_request_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_issue_request_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_issue_request_items_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'material_issue_request_items_organization_id_project_id_re_fkey';
            columns: ['organization_id', 'project_id', 'request_id'];
            isOneToOne: false;
            referencedRelation: 'material_issue_requests';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'material_issue_request_items_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      material_issue_requests: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          request_number: string;
          source_location_id: string;
          destination_location_id: string;
          requested_by: string;
          status: string;
          reason: string;
          approved_by: string | null;
          approved_at: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          request_number: string;
          source_location_id: string;
          destination_location_id: string;
          requested_by?: string;
          status?: string;
          reason: string;
          approved_by?: string | null;
          approved_at?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          request_number?: string;
          source_location_id?: string;
          destination_location_id?: string;
          requested_by?: string;
          status?: string;
          reason?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'material_issue_requests_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_issue_requests_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_issue_requests_organization_id_destination_locati_fkey';
            columns: ['organization_id', 'destination_location_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_locations';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'material_issue_requests_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_issue_requests_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'material_issue_requests_organization_id_requested_by_fkey';
            columns: ['organization_id', 'requested_by'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'material_issue_requests_organization_id_source_location_id_fkey';
            columns: ['organization_id', 'source_location_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_locations';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      material_unit_conversions: {
        Row: {
          id: string;
          organization_id: string;
          variant_id: string;
          purchase_unit: string;
          consumption_unit: string;
          consumption_per_purchase: string;
          purchase_increment: string;
          reason: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          variant_id: string;
          purchase_unit: string;
          consumption_unit: string;
          consumption_per_purchase: string;
          purchase_increment: string;
          reason: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          variant_id?: string;
          purchase_unit?: string;
          consumption_unit?: string;
          consumption_per_purchase?: string;
          purchase_increment?: string;
          reason?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'material_unit_conversions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_unit_conversions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_unit_conversions_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      material_variants: {
        Row: {
          id: string;
          organization_id: string;
          material_id: string;
          name: string;
          code: string;
          attributes: Json;
          default_waste: string;
          active_conversion_id: string | null;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          material_id: string;
          name: string;
          code: string;
          attributes?: Json;
          default_waste?: string;
          active_conversion_id?: string | null;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          material_id?: string;
          name?: string;
          code?: string;
          attributes?: Json;
          default_waste?: string;
          active_conversion_id?: string | null;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'material_variants_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_variants_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'material_variants_organization_id_id_active_conversion_id_fkey';
            columns: ['organization_id', 'id', 'active_conversion_id'];
            isOneToOne: false;
            referencedRelation: 'material_unit_conversions';
            referencedColumns: ['organization_id', 'variant_id', 'id'];
          },
          {
            foreignKeyName: 'material_variants_organization_id_material_id_fkey';
            columns: ['organization_id', 'material_id'];
            isOneToOne: false;
            referencedRelation: 'materials';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      materials: {
        Row: {
          id: string;
          organization_id: string;
          category_id: string;
          name: string;
          code: string;
          brand: string;
          manufacturer: string;
          description: string;
          preferred_vendor_id: string | null;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          category_id: string;
          name: string;
          code: string;
          brand?: string;
          manufacturer?: string;
          description?: string;
          preferred_vendor_id?: string | null;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          category_id?: string;
          name?: string;
          code?: string;
          brand?: string;
          manufacturer?: string;
          description?: string;
          preferred_vendor_id?: string | null;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'materials_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'materials_organization_id_category_id_fkey';
            columns: ['organization_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'material_categories';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'materials_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'materials_organization_id_preferred_vendor_id_fkey';
            columns: ['organization_id', 'preferred_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      measurement_methods: {
        Row: {
          key: string;
          label: string;
          dimension: string;
          fields: Json;
        };
        Insert: {
          key: string;
          label: string;
          dimension: string;
          fields: Json;
        };
        Update: {
          key?: string;
          label?: string;
          dimension?: string;
          fields?: Json;
        };
        Relationships: [];
      };
      membership_roles: {
        Row: {
          id: string;
          organization_id: string;
          membership_id: string;
          role_id: string;
          branch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          membership_id: string;
          role_id: string;
          branch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          membership_id?: string;
          role_id?: string;
          branch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_roles_organization_id_branch_id_fkey';
            columns: ['organization_id', 'branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'membership_roles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membership_roles_organization_id_membership_id_fkey';
            columns: ['organization_id', 'membership_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'membership_roles_organization_id_role_id_fkey';
            columns: ['organization_id', 'role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      modules: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string;
          required_permission: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string;
          required_permission: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          description?: string;
          required_permission?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'modules_required_permission_fkey';
            columns: ['required_permission'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['key'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          organization_id: string;
          user_id: string;
          configuration: Json;
          version: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          configuration: Json;
          version?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          configuration?: Json;
          version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_preferences_organization_id_user_id_fkey';
            columns: ['organization_id', 'user_id'];
            isOneToOne: true;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          recipient_id: string;
          event_id: string;
          job_id: string;
          category: string;
          priority: string;
          title: string;
          status: string;
          version: number;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          recipient_id: string;
          event_id: string;
          job_id: string;
          category: string;
          priority: string;
          title: string;
          status?: string;
          version?: number;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          recipient_id?: string;
          event_id?: string;
          job_id?: string;
          category?: string;
          priority?: string;
          title?: string;
          status?: string;
          version?: number;
          created_at?: string;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_organization_id_event_id_fkey';
            columns: ['organization_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'automation_events';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'notifications_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_organization_id_job_id_fkey';
            columns: ['organization_id', 'job_id'];
            isOneToOne: false;
            referencedRelation: 'automation_jobs';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'notifications_organization_id_recipient_id_fkey';
            columns: ['organization_id', 'recipient_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
        ];
      };
      organization_billing_settings: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          legal_name: string;
          billing_address: string;
          tax_identifier: string;
          invoice_prefix: string;
          receipt_prefix: string;
          contract_prefix: string;
          default_terms: string;
          payment_instructions: string;
          invoice_notes: string;
          receipt_footer: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          legal_name: string;
          billing_address?: string;
          tax_identifier?: string;
          invoice_prefix?: string;
          receipt_prefix?: string;
          contract_prefix?: string;
          default_terms?: string;
          payment_instructions?: string;
          invoice_notes?: string;
          receipt_footer?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          legal_name?: string;
          billing_address?: string;
          tax_identifier?: string;
          invoice_prefix?: string;
          receipt_prefix?: string;
          contract_prefix?: string;
          default_terms?: string;
          payment_instructions?: string;
          invoice_notes?: string;
          receipt_footer?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_billing_settings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_billing_settings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_entitlements: {
        Row: {
          id: string;
          organization_id: string;
          module_id: string;
          enabled: boolean;
          source: string;
          valid_from: string;
          valid_until: string | null;
          configuration: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          module_id: string;
          enabled: boolean;
          source: string;
          valid_from?: string;
          valid_until?: string | null;
          configuration?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          module_id?: string;
          enabled?: boolean;
          source?: string;
          valid_from?: string;
          valid_until?: string | null;
          configuration?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_entitlements_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_entitlements_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_industries: {
        Row: {
          organization_id: string;
          industry_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          industry_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          industry_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_industries_industry_id_fkey';
            columns: ['industry_id'];
            isOneToOne: false;
            referencedRelation: 'industries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_industries_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          branch_id: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          branch_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          branch_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_memberships_organization_id_branch_id_fkey';
            columns: ['organization_id', 'branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'organization_memberships_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_memberships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_quotation_settings: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          prefix: string;
          validity_days: number;
          default_terms: string;
          default_customer_notes: string;
          show_quantity: boolean;
          show_unit_rate: boolean;
          show_specifications: boolean;
          branding: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          prefix?: string;
          validity_days?: number;
          default_terms?: string;
          default_customer_notes?: string;
          show_quantity?: boolean;
          show_unit_rate?: boolean;
          show_specifications?: boolean;
          branding: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          prefix?: string;
          validity_days?: number;
          default_terms?: string;
          default_customer_notes?: string;
          show_quantity?: boolean;
          show_unit_rate?: boolean;
          show_specifications?: boolean;
          branding?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_quotation_settings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_quotation_settings_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          legal_name: string | null;
          status: string;
          default_currency: string;
          default_timezone: string;
          country_code: string;
          plan_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          legal_name?: string | null;
          status?: string;
          default_currency: string;
          default_timezone?: string;
          country_code: string;
          plan_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          legal_name?: string | null;
          status?: string;
          default_currency?: string;
          default_timezone?: string;
          country_code?: string;
          plan_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organizations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organizations_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_allocations: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          payment_id: string;
          invoice_id: string;
          amount: string;
          idempotency_key: string;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          payment_id: string;
          invoice_id: string;
          amount: string;
          idempotency_key: string;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          payment_id?: string;
          invoice_id?: string;
          amount?: string;
          idempotency_key?: string;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_allocations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_allocations_organization_id_contract_id_invoice_id_fkey';
            columns: ['organization_id', 'contract_id', 'invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'payment_allocations_organization_id_contract_id_payment_id_fkey';
            columns: ['organization_id', 'contract_id', 'payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'payment_allocations_reversed_by_fkey';
            columns: ['reversed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_methods: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          kind: string;
          active: boolean;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          kind: string;
          active?: boolean;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          kind?: string;
          active?: boolean;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_methods_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_methods_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_requests: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          schedule_item_id: string;
          request_number: string;
          amount: string;
          due_date: string | null;
          note: string;
          status: string;
          document_snapshot: Json;
          issued_at: string;
          void_reason: string | null;
          voided_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          schedule_item_id: string;
          request_number: string;
          amount: string;
          due_date?: string | null;
          note?: string;
          status?: string;
          document_snapshot: Json;
          issued_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          schedule_item_id?: string;
          request_number?: string;
          amount?: string;
          due_date?: string | null;
          note?: string;
          status?: string;
          document_snapshot?: Json;
          issued_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_requests_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_requests_organization_id_contract_id_schedule_item_fkey';
            columns: ['organization_id', 'contract_id', 'schedule_item_id'];
            isOneToOne: false;
            referencedRelation: 'payment_schedule_items';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
        ];
      };
      payment_schedule_items: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          schedule_id: string;
          label: string;
          description: string;
          calculation_type: string;
          value: string;
          expected_amount: string;
          due_trigger: string;
          due_date: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          schedule_id: string;
          label: string;
          description?: string;
          calculation_type: string;
          value: string;
          expected_amount: string;
          due_trigger?: string;
          due_date?: string | null;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          schedule_id?: string;
          label?: string;
          description?: string;
          calculation_type?: string;
          value?: string;
          expected_amount?: string;
          due_trigger?: string;
          due_date?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_schedule_items_organization_id_contract_id_schedul_fkey';
            columns: ['organization_id', 'contract_id', 'schedule_id'];
            isOneToOne: false;
            referencedRelation: 'payment_schedules';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
        ];
      };
      payment_schedules: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          label: string;
          basis_value: string;
          status: string;
          supersedes_id: string | null;
          version: number;
          activated_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          label: string;
          basis_value: string;
          status?: string;
          supersedes_id?: string | null;
          version?: number;
          activated_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          label?: string;
          basis_value?: string;
          status?: string;
          supersedes_id?: string | null;
          version?: number;
          activated_at?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_schedules_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_schedules_organization_id_contract_id_fkey';
            columns: ['organization_id', 'contract_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'payment_schedules_organization_id_contract_id_supersedes_i_fkey';
            columns: ['organization_id', 'contract_id', 'supersedes_id'];
            isOneToOne: false;
            referencedRelation: 'payment_schedules';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          customer_id: string;
          project_id: string;
          payment_number: string;
          currency: string;
          payment_date: string;
          amount: string;
          method_id: string;
          method_snapshot: Json;
          external_reference: string;
          notes: string;
          idempotency_key: string;
          request_hash: string;
          status: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          customer_id: string;
          project_id: string;
          payment_number: string;
          currency: string;
          payment_date: string;
          amount: string;
          method_id: string;
          method_snapshot: Json;
          external_reference?: string;
          notes?: string;
          idempotency_key: string;
          request_hash: string;
          status?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          customer_id?: string;
          project_id?: string;
          payment_number?: string;
          currency?: string;
          payment_date?: string;
          amount?: string;
          method_id?: string;
          method_snapshot?: Json;
          external_reference?: string;
          notes?: string;
          idempotency_key?: string;
          request_hash?: string;
          status?: string;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_organization_id_contract_id_customer_id_project_i_fkey';
            columns: [
              'organization_id',
              'contract_id',
              'customer_id',
              'project_id',
            ];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: [
              'organization_id',
              'id',
              'customer_id',
              'project_id',
            ];
          },
          {
            foreignKeyName: 'payments_organization_id_method_id_fkey';
            columns: ['organization_id', 'method_id'];
            isOneToOne: false;
            referencedRelation: 'payment_methods';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'payments_voided_by_fkey';
            columns: ['voided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          id: string;
          key: string;
          scope: string;
          description: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          scope: string;
          description: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          scope?: string;
          description?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_modules: {
        Row: {
          plan_id: string;
          module_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          plan_id: string;
          module_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan_id?: string;
          module_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_modules_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_modules_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          id: string;
          key: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_role_permissions_permission_id_fkey';
            columns: ['permission_id'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_role_permissions_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'platform_roles';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_roles: {
        Row: {
          id: string;
          key: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      platform_user_roles: {
        Row: {
          user_id: string;
          role_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          role_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_user_roles_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'platform_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      price_book_items: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          item_id: string;
          price_book_id: string | null;
          currency: string;
          base_rate: string;
          minimum_rate: string | null;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          item_id: string;
          price_book_id?: string | null;
          currency: string;
          base_rate: string;
          minimum_rate?: string | null;
          valid_from: string;
          valid_until?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          item_id?: string;
          price_book_id?: string | null;
          currency?: string;
          base_rate?: string;
          minimum_rate?: string | null;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'price_book_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'price_book_items_organization_id_item_id_fkey';
            columns: ['organization_id', 'item_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'price_book_items_organization_id_price_book_id_fkey';
            columns: ['organization_id', 'price_book_id'];
            isOneToOne: false;
            referencedRelation: 'price_books';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      price_books: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          name: string;
          key: string;
          currency: string;
          branch_id: string | null;
          is_default: boolean;
          valid_from: string;
          valid_until: string | null;
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
          currency: string;
          branch_id?: string | null;
          is_default?: boolean;
          valid_from: string;
          valid_until?: string | null;
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
          currency?: string;
          branch_id?: string | null;
          is_default?: boolean;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'price_books_organization_id_branch_id_fkey';
            columns: ['organization_id', 'branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'price_books_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      pricing_costs: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          rate_id: string;
          estimated_cost_rate: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          rate_id: string;
          estimated_cost_rate: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
          rate_id?: string;
          estimated_cost_rate?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pricing_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pricing_costs_organization_id_rate_id_fkey';
            columns: ['organization_id', 'rate_id'];
            isOneToOne: false;
            referencedRelation: 'price_book_items';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      pricing_modifiers: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          status: string;
          created_at: string;
          updated_at: string;
          item_id: string;
          option_id: string | null;
          price_book_id: string | null;
          label: string;
          kind: string;
          value: string;
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
          option_id?: string | null;
          price_book_id?: string | null;
          label: string;
          kind: string;
          value: string;
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
          option_id?: string | null;
          price_book_id?: string | null;
          label?: string;
          kind?: string;
          value?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'pricing_modifiers_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pricing_modifiers_organization_id_item_id_fkey';
            columns: ['organization_id', 'item_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'pricing_modifiers_organization_id_item_id_option_id_fkey';
            columns: ['organization_id', 'item_id', 'option_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_attribute_options';
            referencedColumns: ['organization_id', 'item_id', 'id'];
          },
          {
            foreignKeyName: 'pricing_modifiers_organization_id_price_book_id_fkey';
            columns: ['organization_id', 'price_book_id'];
            isOneToOne: false;
            referencedRelation: 'price_books';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          avatar_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_areas: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          project_id: string;
          parent_id: string | null;
          name: string;
          code: string;
          area_type: string;
          sort_order: number;
          notes: string;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          project_id: string;
          parent_id?: string | null;
          name: string;
          code?: string;
          area_type?: string;
          sort_order?: number;
          notes?: string;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          project_id?: string;
          parent_id?: string | null;
          name?: string;
          code?: string;
          area_type?: string;
          sort_order?: number;
          notes?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_areas_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_areas_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_areas_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_areas_organization_id_project_id_parent_id_fkey';
            columns: ['organization_id', 'project_id', 'parent_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      project_execution_events: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          entity: string;
          entity_id: string;
          action: string;
          from_status: string | null;
          to_status: string | null;
          note: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          entity: string;
          entity_id: string;
          action: string;
          from_status?: string | null;
          to_status?: string | null;
          note?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          entity?: string;
          entity_id?: string;
          action?: string;
          from_status?: string | null;
          to_status?: string | null;
          note?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_execution_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_execution_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_execution_events_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      project_execution_members: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          user_id: string;
          active: boolean;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          user_id: string;
          active?: boolean;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          user_id?: string;
          active?: boolean;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_execution_members_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_execution_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_execution_members_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_execution_members_organization_id_user_id_fkey';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
        ];
      };
      project_inspections: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          template_id: string;
          area_id: string | null;
          work_package_id: string | null;
          predecessor_id: string | null;
          number: string;
          inspector_id: string;
          status: string;
          inspection_date: string;
          is_final: boolean;
          mandatory: boolean;
          template_snapshot: Json;
          checklist: Json;
          notes: string;
          approved_at: string | null;
          approved_by: string | null;
          document_snapshot: Json | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          template_id: string;
          area_id?: string | null;
          work_package_id?: string | null;
          predecessor_id?: string | null;
          number: string;
          inspector_id: string;
          status?: string;
          inspection_date?: string;
          is_final: boolean;
          mandatory: boolean;
          template_snapshot: Json;
          checklist: Json;
          notes?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          document_snapshot?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          template_id?: string;
          area_id?: string | null;
          work_package_id?: string | null;
          predecessor_id?: string | null;
          number?: string;
          inspector_id?: string;
          status?: string;
          inspection_date?: string;
          is_final?: boolean;
          mandatory?: boolean;
          template_snapshot?: Json;
          checklist?: Json;
          notes?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          document_snapshot?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_inspections_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_inspections_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_inspector_id_fkey';
            columns: ['organization_id', 'inspector_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_project_id_predecessor_fkey';
            columns: ['organization_id', 'project_id', 'predecessor_id'];
            isOneToOne: false;
            referencedRelation: 'project_inspections';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_project_id_work_packag_fkey';
            columns: ['organization_id', 'project_id', 'work_package_id'];
            isOneToOne: false;
            referencedRelation: 'work_packages';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'project_inspections_organization_id_template_id_fkey';
            columns: ['organization_id', 'template_id'];
            isOneToOne: false;
            referencedRelation: 'inspection_templates';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      project_milestones: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          name: string;
          description: string;
          sequence: number;
          owner_id: string | null;
          status: string;
          completion_percentage: string;
          planned_start: string | null;
          planned_end: string | null;
          actual_start: string | null;
          actual_end: string | null;
          notes: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          name: string;
          description?: string;
          sequence?: number;
          owner_id?: string | null;
          status?: string;
          completion_percentage?: string;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          plan_id?: string;
          name?: string;
          description?: string;
          sequence?: number;
          owner_id?: string | null;
          status?: string;
          completion_percentage?: string;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_milestones_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_milestones_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_milestones_organization_id_owner_id_fkey';
            columns: ['organization_id', 'owner_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'project_milestones_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_milestones_organization_id_project_id_plan_id_fkey';
            columns: ['organization_id', 'project_id', 'plan_id'];
            isOneToOne: false;
            referencedRelation: 'execution_plans';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      project_snags: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          area_id: string | null;
          task_id: string | null;
          inspection_id: string | null;
          number: string;
          title: string;
          description: string;
          priority: string;
          assigned_to: string | null;
          vendor_id: string | null;
          due_date: string | null;
          status: string;
          resolution: string;
          verification: string;
          post_handover: boolean;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          area_id?: string | null;
          task_id?: string | null;
          inspection_id?: string | null;
          number: string;
          title: string;
          description?: string;
          priority: string;
          assigned_to?: string | null;
          vendor_id?: string | null;
          due_date?: string | null;
          status?: string;
          resolution?: string;
          verification?: string;
          post_handover?: boolean;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          area_id?: string | null;
          task_id?: string | null;
          inspection_id?: string | null;
          number?: string;
          title?: string;
          description?: string;
          priority?: string;
          assigned_to?: string | null;
          vendor_id?: string | null;
          due_date?: string | null;
          status?: string;
          resolution?: string;
          verification?: string;
          post_handover?: boolean;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_snags_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_assigned_to_fkey';
            columns: ['organization_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_project_id_inspection_id_fkey';
            columns: ['organization_id', 'project_id', 'inspection_id'];
            isOneToOne: false;
            referencedRelation: 'project_inspections';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_project_id_task_id_fkey';
            columns: ['organization_id', 'project_id', 'task_id'];
            isOneToOne: false;
            referencedRelation: 'project_tasks';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'project_snags_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      project_tasks: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          area_id: string | null;
          work_package_id: string | null;
          milestone_id: string | null;
          title: string;
          description: string;
          assigned_to: string | null;
          priority: string;
          status: string;
          completion_percentage: string;
          weight: string;
          block_reason: string;
          blocked_at: string | null;
          blocked_by: string | null;
          planned_start: string | null;
          planned_end: string | null;
          actual_start: string | null;
          actual_end: string | null;
          notes: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          area_id?: string | null;
          work_package_id?: string | null;
          milestone_id?: string | null;
          title: string;
          description?: string;
          assigned_to?: string | null;
          priority?: string;
          status?: string;
          completion_percentage?: string;
          weight?: string;
          block_reason?: string;
          blocked_at?: string | null;
          blocked_by?: string | null;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          plan_id?: string;
          area_id?: string | null;
          work_package_id?: string | null;
          milestone_id?: string | null;
          title?: string;
          description?: string;
          assigned_to?: string | null;
          priority?: string;
          status?: string;
          completion_percentage?: string;
          weight?: string;
          block_reason?: string;
          blocked_at?: string | null;
          blocked_by?: string | null;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_tasks_blocked_by_fkey';
            columns: ['blocked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_tasks_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_assigned_to_fkey';
            columns: ['organization_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_project_id_milestone_id_fkey';
            columns: ['organization_id', 'project_id', 'milestone_id'];
            isOneToOne: false;
            referencedRelation: 'project_milestones';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_project_id_plan_id_fkey';
            columns: ['organization_id', 'project_id', 'plan_id'];
            isOneToOne: false;
            referencedRelation: 'execution_plans';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'project_tasks_organization_id_project_id_work_package_id_fkey';
            columns: ['organization_id', 'project_id', 'work_package_id'];
            isOneToOne: false;
            referencedRelation: 'work_packages';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          customer_id: string;
          name: string;
          code: string;
          industry_id: string | null;
          branch_id: string | null;
          project_type: string;
          site_address: Json;
          status: string;
          notes: string;
          assigned_user_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          customer_id: string;
          name: string;
          code: string;
          industry_id?: string | null;
          branch_id?: string | null;
          project_type?: string;
          site_address?: Json;
          status?: string;
          notes?: string;
          assigned_user_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          customer_id?: string;
          name?: string;
          code?: string;
          industry_id?: string | null;
          branch_id?: string | null;
          project_type?: string;
          site_address?: Json;
          status?: string;
          notes?: string;
          assigned_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_industry_id_fkey';
            columns: ['industry_id'];
            isOneToOne: false;
            referencedRelation: 'industries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_organization_id_assigned_user_id_fkey';
            columns: ['organization_id', 'assigned_user_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'projects_organization_id_branch_id_fkey';
            columns: ['organization_id', 'branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'projects_organization_id_customer_id_fkey';
            columns: ['organization_id', 'customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'projects_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      purchase_order_costs: {
        Row: {
          id: string;
          organization_id: string;
          po_id: string;
          subtotal: string;
          tax_amount: string;
          freight: string;
          total: string;
          document_snapshot: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          po_id: string;
          subtotal: string;
          tax_amount: string;
          freight: string;
          total: string;
          document_snapshot: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          po_id?: string;
          subtotal?: string;
          tax_amount?: string;
          freight?: string;
          total?: string;
          document_snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_order_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_costs_organization_id_po_id_fkey';
            columns: ['organization_id', 'po_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      purchase_order_item_costs: {
        Row: {
          id: string;
          organization_id: string;
          po_id: string;
          item_id: string;
          unit_price: string;
          discount: string;
          taxable_amount: string;
          tax_amount: string;
          freight: string;
          total: string;
          snapshot: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          po_id: string;
          item_id: string;
          unit_price: string;
          discount: string;
          taxable_amount: string;
          tax_amount: string;
          freight: string;
          total: string;
          snapshot: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          po_id?: string;
          item_id?: string;
          unit_price?: string;
          discount?: string;
          taxable_amount?: string;
          tax_amount?: string;
          freight?: string;
          total?: string;
          snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_order_item_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_item_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_item_costs_organization_id_po_id_item_id_fkey';
            columns: ['organization_id', 'po_id', 'item_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_order_items';
            referencedColumns: ['organization_id', 'po_id', 'id'];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          id: string;
          organization_id: string;
          po_id: string;
          quote_item_id: string;
          requisition_item_id: string;
          variant_id: string | null;
          cost_kind: string;
          description: string;
          unit: string;
          quantity: string;
          scope_snapshot: Json;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          po_id: string;
          quote_item_id: string;
          requisition_item_id: string;
          variant_id?: string | null;
          cost_kind: string;
          description?: string;
          unit: string;
          quantity: string;
          scope_snapshot: Json;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          po_id?: string;
          quote_item_id?: string;
          requisition_item_id?: string;
          variant_id?: string | null;
          cost_kind?: string;
          description?: string;
          unit?: string;
          quantity?: string;
          scope_snapshot?: Json;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_order_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_items_organization_id_po_id_fkey';
            columns: ['organization_id', 'po_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_order_items_organization_id_quote_item_id_fkey';
            columns: ['organization_id', 'quote_item_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_quote_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_order_items_organization_id_requisition_item_id_fkey';
            columns: ['organization_id', 'requisition_item_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_requisition_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_order_items_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          vendor_id: string;
          quote_id: string;
          requisition_id: string;
          po_number: string;
          currency: string;
          status: string;
          order_date: string;
          delivery_date: string | null;
          delivery_location: string;
          notes: string;
          version: number;
          idempotency_key: string;
          request_hash: string;
          issued_at: string | null;
          issued_by: string | null;
          decision_reason: string;
          closed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          vendor_id: string;
          quote_id: string;
          requisition_id: string;
          po_number: string;
          currency: string;
          status?: string;
          order_date: string;
          delivery_date?: string | null;
          delivery_location: string;
          notes?: string;
          version?: number;
          idempotency_key: string;
          request_hash: string;
          issued_at?: string | null;
          issued_by?: string | null;
          decision_reason?: string;
          closed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          project_id?: string;
          vendor_id?: string;
          quote_id?: string;
          requisition_id?: string;
          po_number?: string;
          currency?: string;
          status?: string;
          order_date?: string;
          delivery_date?: string | null;
          delivery_location?: string;
          notes?: string;
          version?: number;
          idempotency_key?: string;
          request_hash?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          decision_reason?: string;
          closed_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_orders_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_orders_organization_id_contract_id_project_id_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'purchase_orders_organization_id_contract_id_requisition_id_fkey';
            columns: ['organization_id', 'contract_id', 'requisition_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_requisitions';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_orders_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_orders_organization_id_quote_id_fkey';
            columns: ['organization_id', 'quote_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_quotes';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_orders_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      purchase_requisition_items: {
        Row: {
          id: string;
          organization_id: string;
          requisition_id: string;
          variant_id: string | null;
          category_id: string | null;
          cost_kind: string;
          description: string;
          unit: string;
          quantity: string;
          snapshot: Json;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          requisition_id: string;
          variant_id?: string | null;
          category_id?: string | null;
          cost_kind: string;
          description?: string;
          unit: string;
          quantity: string;
          snapshot: Json;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          requisition_id?: string;
          variant_id?: string | null;
          category_id?: string | null;
          cost_kind?: string;
          description?: string;
          unit?: string;
          quantity?: string;
          snapshot?: Json;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_requisition_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_requisition_items_organization_id_category_id_fkey';
            columns: ['organization_id', 'category_id'];
            isOneToOne: false;
            referencedRelation: 'material_categories';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_requisition_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_requisition_items_organization_id_requisition_id_fkey';
            columns: ['organization_id', 'requisition_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_requisitions';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_requisition_items_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      purchase_requisition_sources: {
        Row: {
          id: string;
          organization_id: string;
          requisition_id: string;
          item_id: string;
          estimate_line_id: string;
          quantity: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          requisition_id: string;
          item_id: string;
          estimate_line_id: string;
          quantity: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          requisition_id?: string;
          item_id?: string;
          estimate_line_id?: string;
          quantity?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_requisition_sources_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_requisition_sources_organization_id_estimate_line_fkey';
            columns: ['organization_id', 'estimate_line_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_lines';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_requisition_sources_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_requisition_sources_organization_id_requisition_i_fkey';
            columns: ['organization_id', 'requisition_id', 'item_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_requisition_items';
            referencedColumns: ['organization_id', 'requisition_id', 'id'];
          },
        ];
      };
      purchase_requisitions: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          estimate_revision_id: string;
          requisition_number: string;
          status: string;
          required_date: string | null;
          priority: string;
          delivery_location: string;
          notes: string;
          version: number;
          idempotency_key: string;
          request_hash: string;
          approved_at: string | null;
          approved_by: string | null;
          cancel_reason: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          estimate_revision_id: string;
          requisition_number: string;
          status?: string;
          required_date?: string | null;
          priority?: string;
          delivery_location: string;
          notes?: string;
          version?: number;
          idempotency_key: string;
          request_hash: string;
          approved_at?: string | null;
          approved_by?: string | null;
          cancel_reason?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          project_id?: string;
          estimate_revision_id?: string;
          requisition_number?: string;
          status?: string;
          required_date?: string | null;
          priority?: string;
          delivery_location?: string;
          notes?: string;
          version?: number;
          idempotency_key?: string;
          request_hash?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          cancel_reason?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_requisitions_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_requisitions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_requisitions_organization_id_contract_id_estimate_fkey';
            columns: ['organization_id', 'contract_id', 'estimate_revision_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_revisions';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'purchase_requisitions_organization_id_contract_id_project__fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'purchase_requisitions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      quotation_customer_responses: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          quotation_id: string;
          revision_id: string;
          share_id: string;
          action: string;
          customer_name: string;
          comment: string;
          acknowledged: boolean;
          responded_at: string;
          accepted_amount: string | null;
          currency: string;
          snapshot_hash: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          quotation_id: string;
          revision_id: string;
          share_id: string;
          action: string;
          customer_name: string;
          comment?: string;
          acknowledged: boolean;
          responded_at?: string;
          accepted_amount?: string | null;
          currency: string;
          snapshot_hash: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          quotation_id?: string;
          revision_id?: string;
          share_id?: string;
          action?: string;
          customer_name?: string;
          comment?: string;
          acknowledged?: boolean;
          responded_at?: string;
          accepted_amount?: string | null;
          currency?: string;
          snapshot_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quotation_customer_responses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_customer_responses_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_customer_responses_organization_id_quotation_id__fkey';
            columns: ['organization_id', 'quotation_id', 'revision_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_revisions';
            referencedColumns: ['organization_id', 'quotation_id', 'id'];
          },
          {
            foreignKeyName: 'quotation_customer_responses_organization_id_share_id_fkey';
            columns: ['organization_id', 'share_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_share_links';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      quotation_item_costs: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          item_id: string;
          cost_snapshot: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          item_id: string;
          cost_snapshot: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          item_id?: string;
          cost_snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'quotation_item_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_item_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_item_costs_organization_id_item_id_fkey';
            columns: ['organization_id', 'item_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_items';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      quotation_items: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          revision_id: string;
          project_id: string;
          project_area_id: string | null;
          catalog_item_id: string | null;
          lineage_id: string;
          optional: boolean;
          sort_order: number;
          description: string;
          area_snapshot: Json;
          snapshot: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          revision_id: string;
          project_id: string;
          project_area_id?: string | null;
          catalog_item_id?: string | null;
          lineage_id?: string;
          optional?: boolean;
          sort_order?: number;
          description?: string;
          area_snapshot?: Json;
          snapshot: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          revision_id?: string;
          project_id?: string;
          project_area_id?: string | null;
          catalog_item_id?: string | null;
          lineage_id?: string;
          optional?: boolean;
          sort_order?: number;
          description?: string;
          area_snapshot?: Json;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'quotation_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_items_organization_id_catalog_item_id_fkey';
            columns: ['organization_id', 'catalog_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalog_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'quotation_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_items_organization_id_project_id_project_area_id_fkey';
            columns: ['organization_id', 'project_id', 'project_area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'quotation_items_organization_id_revision_id_project_id_fkey';
            columns: ['organization_id', 'revision_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_revisions';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
        ];
      };
      quotation_revisions: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          quotation_id: string;
          project_id: string;
          revision_number: number;
          status: string;
          currency: string;
          valid_until: string;
          document_snapshot: Json;
          terms: string;
          customer_notes: string;
          internal_notes: string;
          discount: Json;
          totals: Json;
          issued_at: string | null;
          issued_by: string | null;
          superseded_at: string | null;
          cancelled_at: string | null;
          created_from_revision_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          quotation_id: string;
          project_id: string;
          revision_number: number;
          status?: string;
          currency: string;
          valid_until: string;
          document_snapshot: Json;
          terms?: string;
          customer_notes?: string;
          internal_notes?: string;
          discount?: Json;
          totals?: Json;
          issued_at?: string | null;
          issued_by?: string | null;
          superseded_at?: string | null;
          cancelled_at?: string | null;
          created_from_revision_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          quotation_id?: string;
          project_id?: string;
          revision_number?: number;
          status?: string;
          currency?: string;
          valid_until?: string;
          document_snapshot?: Json;
          terms?: string;
          customer_notes?: string;
          internal_notes?: string;
          discount?: Json;
          totals?: Json;
          issued_at?: string | null;
          issued_by?: string | null;
          superseded_at?: string | null;
          cancelled_at?: string | null;
          created_from_revision_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quotation_revisions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_revisions_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_revisions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_revisions_organization_id_quotation_id_created_f_fkey';
            columns: [
              'organization_id',
              'quotation_id',
              'created_from_revision_id',
            ];
            isOneToOne: false;
            referencedRelation: 'quotation_revisions';
            referencedColumns: ['organization_id', 'quotation_id', 'id'];
          },
          {
            foreignKeyName: 'quotation_revisions_organization_id_quotation_id_project_i_fkey';
            columns: ['organization_id', 'quotation_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'quotations';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
        ];
      };
      quotation_share_links: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          revision_id: string;
          expires_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          pdf_enabled: boolean;
          first_viewed_at: string | null;
          last_viewed_at: string | null;
          view_count: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          revision_id: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          pdf_enabled?: boolean;
          first_viewed_at?: string | null;
          last_viewed_at?: string | null;
          view_count?: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          revision_id?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          pdf_enabled?: boolean;
          first_viewed_at?: string | null;
          last_viewed_at?: string | null;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'quotation_share_links_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_share_links_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_share_links_organization_id_revision_id_fkey';
            columns: ['organization_id', 'revision_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_revisions';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'quotation_share_links_revoked_by_fkey';
            columns: ['revoked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      quotations: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
          customer_id: string;
          project_id: string;
          quotation_number: string;
          current_revision_id: string | null;
          next_revision: number;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          customer_id: string;
          project_id: string;
          quotation_number: string;
          current_revision_id?: string | null;
          next_revision?: number;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          customer_id?: string;
          project_id?: string;
          quotation_number?: string;
          current_revision_id?: string | null;
          next_revision?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quotations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_organization_id_id_current_revision_id_fkey';
            columns: ['organization_id', 'id', 'current_revision_id'];
            isOneToOne: false;
            referencedRelation: 'quotation_revisions';
            referencedColumns: ['organization_id', 'quotation_id', 'id'];
          },
          {
            foreignKeyName: 'quotations_organization_id_project_id_customer_id_fkey';
            columns: ['organization_id', 'project_id', 'customer_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id', 'customer_id'];
          },
        ];
      };
      receipts: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          payment_id: string;
          receipt_number: string;
          document_snapshot: Json;
          status: string;
          voided_at: string | null;
          void_reason: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          payment_id: string;
          receipt_number: string;
          document_snapshot: Json;
          status?: string;
          voided_at?: string | null;
          void_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          payment_id?: string;
          receipt_number?: string;
          document_snapshot?: Json;
          status?: string;
          voided_at?: string | null;
          void_reason?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receipts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'receipts_organization_id_contract_id_payment_id_fkey';
            columns: ['organization_id', 'contract_id', 'payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
        ];
      };
      report_snapshots: {
        Row: {
          id: string;
          organization_id: string;
          kind: string;
          filters: Json;
          data: Json;
          renderer_version: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          kind: string;
          filters: Json;
          data: Json;
          renderer_version?: number;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          kind?: string;
          filters?: Json;
          data?: Json;
          renderer_version?: number;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_snapshots_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_snapshots_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      rfq_items: {
        Row: {
          id: string;
          organization_id: string;
          rfq_id: string;
          requisition_item_id: string;
          description: string;
          unit: string;
          quantity: string;
          snapshot: Json;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          rfq_id: string;
          requisition_item_id: string;
          description?: string;
          unit: string;
          quantity: string;
          snapshot: Json;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          rfq_id?: string;
          requisition_item_id?: string;
          description?: string;
          unit?: string;
          quantity?: string;
          snapshot?: Json;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rfq_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rfq_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rfq_items_organization_id_requisition_item_id_fkey';
            columns: ['organization_id', 'requisition_item_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_requisition_items';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'rfq_items_organization_id_rfq_id_fkey';
            columns: ['organization_id', 'rfq_id'];
            isOneToOne: false;
            referencedRelation: 'rfqs';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      rfq_vendors: {
        Row: {
          id: string;
          organization_id: string;
          rfq_id: string;
          vendor_id: string;
          response_status: string;
          vendor_snapshot: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          rfq_id: string;
          vendor_id: string;
          response_status?: string;
          vendor_snapshot: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          rfq_id?: string;
          vendor_id?: string;
          response_status?: string;
          vendor_snapshot?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rfq_vendors_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rfq_vendors_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rfq_vendors_organization_id_rfq_id_fkey';
            columns: ['organization_id', 'rfq_id'];
            isOneToOne: false;
            referencedRelation: 'rfqs';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'rfq_vendors_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      rfqs: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          requisition_id: string;
          rfq_number: string;
          status: string;
          required_date: string | null;
          delivery_location: string;
          notes: string;
          version: number;
          idempotency_key: string;
          request_hash: string;
          issued_at: string | null;
          document_snapshot: Json | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          requisition_id: string;
          rfq_number: string;
          status?: string;
          required_date?: string | null;
          delivery_location: string;
          notes?: string;
          version?: number;
          idempotency_key: string;
          request_hash: string;
          issued_at?: string | null;
          document_snapshot?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          project_id?: string;
          requisition_id?: string;
          rfq_number?: string;
          status?: string;
          required_date?: string | null;
          delivery_location?: string;
          notes?: string;
          version?: number;
          idempotency_key?: string;
          request_hash?: string;
          issued_at?: string | null;
          document_snapshot?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rfqs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rfqs_organization_id_contract_id_project_id_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'rfqs_organization_id_contract_id_requisition_id_fkey';
            columns: ['organization_id', 'contract_id', 'requisition_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_requisitions';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'rfqs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          organization_id: string;
          role_id: string;
          permission_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          role_id: string;
          permission_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          role_id?: string;
          permission_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_permissions_organization_id_role_id_fkey';
            columns: ['organization_id', 'role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'role_permissions_permission_id_fkey';
            columns: ['permission_id'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          name: string;
          is_owner: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          name: string;
          is_owner?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          key?: string;
          name?: string;
          is_owner?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'roles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      site_visits: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          lead_id: string;
          project_id: string | null;
          scheduled_at: string;
          assigned_to: string;
          site_address: Json;
          contact_person: string;
          status: string;
          notes: string;
          outcome: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_id: string;
          project_id?: string | null;
          scheduled_at: string;
          assigned_to: string;
          site_address: Json;
          contact_person?: string;
          status?: string;
          notes?: string;
          outcome?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          lead_id?: string;
          project_id?: string | null;
          scheduled_at?: string;
          assigned_to?: string;
          site_address?: Json;
          contact_person?: string;
          status?: string;
          notes?: string;
          outcome?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'site_visits_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'site_visits_organization_id_assigned_to_fkey';
            columns: ['organization_id', 'assigned_to'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'site_visits_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'site_visits_organization_id_lead_id_fkey';
            columns: ['organization_id', 'lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'site_visits_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      subcontractor_work_order_costs: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          work_order_id: string;
          currency: string;
          agreed_amount: string;
          unit_rate: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          work_order_id: string;
          currency: string;
          agreed_amount: string;
          unit_rate: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          work_order_id?: string;
          currency?: string;
          agreed_amount?: string;
          unit_rate?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subcontractor_work_order_cost_organization_id_project_id_w_fkey';
            columns: ['organization_id', 'project_id', 'work_order_id'];
            isOneToOne: false;
            referencedRelation: 'subcontractor_work_orders';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'subcontractor_work_order_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcontractor_work_order_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcontractor_work_order_costs_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      subcontractor_work_orders: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          vendor_id: string;
          area_id: string | null;
          number: string;
          title: string;
          scope: string;
          unit: string;
          quantity: string;
          status: string;
          completed_percentage: string;
          accepted_percentage: string;
          planned_start: string | null;
          planned_end: string | null;
          actual_start: string | null;
          actual_end: string | null;
          notes: string;
          document_snapshot: Json | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          vendor_id: string;
          area_id?: string | null;
          number: string;
          title: string;
          scope: string;
          unit: string;
          quantity: string;
          status?: string;
          completed_percentage?: string;
          accepted_percentage?: string;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          notes?: string;
          document_snapshot?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          plan_id?: string;
          vendor_id?: string;
          area_id?: string | null;
          number?: string;
          title?: string;
          scope?: string;
          unit?: string;
          quantity?: string;
          status?: string;
          completed_percentage?: string;
          accepted_percentage?: string;
          planned_start?: string | null;
          planned_end?: string | null;
          actual_start?: string | null;
          actual_end?: string | null;
          notes?: string;
          document_snapshot?: Json | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subcontractor_work_orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcontractor_work_orders_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'subcontractor_work_orders_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcontractor_work_orders_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'subcontractor_work_orders_organization_id_project_id_plan__fkey';
            columns: ['organization_id', 'project_id', 'plan_id'];
            isOneToOne: false;
            referencedRelation: 'execution_plans';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'subcontractor_work_orders_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      task_dependencies: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          task_id: string;
          predecessor_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          task_id: string;
          predecessor_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          task_id?: string;
          predecessor_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_dependencies_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_dependencies_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_dependencies_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'task_dependencies_organization_id_project_id_predecessor_i_fkey';
            columns: ['organization_id', 'project_id', 'predecessor_id'];
            isOneToOne: false;
            referencedRelation: 'project_tasks';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'task_dependencies_organization_id_project_id_task_id_fkey';
            columns: ['organization_id', 'project_id', 'task_id'];
            isOneToOne: false;
            referencedRelation: 'project_tasks';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      tax_codes: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          jurisdiction: string;
          components: Json;
          active: boolean;
          version: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          jurisdiction?: string;
          components: Json;
          active?: boolean;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          code?: string;
          jurisdiction?: string;
          components?: Json;
          active?: boolean;
          version?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tax_codes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tax_codes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      units: {
        Row: {
          key: string;
          label: string;
          dimension: string;
        };
        Insert: {
          key: string;
          label: string;
          dimension: string;
        };
        Update: {
          key?: string;
          label?: string;
          dimension?: string;
        };
        Relationships: [];
      };
      vendor_contacts: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          name: string;
          role: string;
          phone: string;
          email: string;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          name: string;
          role?: string;
          phone?: string;
          email?: string;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          vendor_id?: string;
          name?: string;
          role?: string;
          phone?: string;
          email?: string;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_contacts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_contacts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_contacts_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      vendor_execution_profiles: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          specialization: string;
          service_areas: string;
          active: boolean;
          notes: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          specialization?: string;
          service_areas?: string;
          active?: boolean;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          vendor_id?: string;
          specialization?: string;
          service_areas?: string;
          active?: boolean;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_execution_profiles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_execution_profiles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_execution_profiles_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      vendor_materials: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          variant_id: string;
          vendor_description: string;
          lead_time_days: number;
          minimum_order: string;
          pack_quantity: string;
          preferred: boolean;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          variant_id: string;
          vendor_description?: string;
          lead_time_days?: number;
          minimum_order: string;
          pack_quantity: string;
          preferred?: boolean;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          vendor_id?: string;
          variant_id?: string;
          vendor_description?: string;
          lead_time_days?: number;
          minimum_order?: string;
          pack_quantity?: string;
          preferred?: boolean;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_materials_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_materials_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_materials_organization_id_variant_id_fkey';
            columns: ['organization_id', 'variant_id'];
            isOneToOne: false;
            referencedRelation: 'material_variants';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'vendor_materials_organization_id_vendor_id_fkey';
            columns: ['organization_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'vendors';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      vendor_quote_items: {
        Row: {
          id: string;
          organization_id: string;
          quote_id: string;
          rfq_id: string;
          rfq_item_id: string;
          description: string;
          unit: string;
          quantity: string;
          unit_price: string;
          discount: string;
          taxable_amount: string;
          tax_amount: string;
          total: string;
          tax_mode: string;
          tax_components: Json;
          minimum_order: string;
          lead_time_days: number;
          notes: string;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          quote_id: string;
          rfq_id: string;
          rfq_item_id: string;
          description?: string;
          unit: string;
          quantity: string;
          unit_price: string;
          discount: string;
          taxable_amount: string;
          tax_amount: string;
          total: string;
          tax_mode: string;
          tax_components: Json;
          minimum_order: string;
          lead_time_days: number;
          notes?: string;
          sort_order: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          quote_id?: string;
          rfq_id?: string;
          rfq_item_id?: string;
          description?: string;
          unit?: string;
          quantity?: string;
          unit_price?: string;
          discount?: string;
          taxable_amount?: string;
          tax_amount?: string;
          total?: string;
          tax_mode?: string;
          tax_components?: Json;
          minimum_order?: string;
          lead_time_days?: number;
          notes?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_quote_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_quote_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_quote_items_organization_id_rfq_id_quote_id_fkey';
            columns: ['organization_id', 'rfq_id', 'quote_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_quotes';
            referencedColumns: ['organization_id', 'rfq_id', 'id'];
          },
          {
            foreignKeyName: 'vendor_quote_items_organization_id_rfq_id_rfq_item_id_fkey';
            columns: ['organization_id', 'rfq_id', 'rfq_item_id'];
            isOneToOne: false;
            referencedRelation: 'rfq_items';
            referencedColumns: ['organization_id', 'rfq_id', 'id'];
          },
        ];
      };
      vendor_quotes: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          rfq_id: string;
          vendor_id: string;
          reference: string;
          currency: string;
          valid_until: string;
          status: string;
          lead_time_days: number;
          freight: string;
          subtotal: string;
          tax_amount: string;
          total: string;
          payment_terms: string;
          notes: string;
          version: number;
          recorded_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          idempotency_key: string;
          request_hash: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          project_id: string;
          rfq_id: string;
          vendor_id: string;
          reference: string;
          currency: string;
          valid_until: string;
          status?: string;
          lead_time_days?: number;
          freight: string;
          subtotal: string;
          tax_amount: string;
          total: string;
          payment_terms?: string;
          notes?: string;
          version?: number;
          recorded_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          idempotency_key?: string;
          request_hash?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          project_id?: string;
          rfq_id?: string;
          vendor_id?: string;
          reference?: string;
          currency?: string;
          valid_until?: string;
          status?: string;
          lead_time_days?: number;
          freight?: string;
          subtotal?: string;
          tax_amount?: string;
          total?: string;
          payment_terms?: string;
          notes?: string;
          version?: number;
          recorded_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          idempotency_key?: string;
          request_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_quotes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_quotes_organization_id_contract_id_project_id_fkey';
            columns: ['organization_id', 'contract_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'contracts';
            referencedColumns: ['organization_id', 'id', 'project_id'];
          },
          {
            foreignKeyName: 'vendor_quotes_organization_id_contract_id_rfq_id_fkey';
            columns: ['organization_id', 'contract_id', 'rfq_id'];
            isOneToOne: false;
            referencedRelation: 'rfqs';
            referencedColumns: ['organization_id', 'contract_id', 'id'];
          },
          {
            foreignKeyName: 'vendor_quotes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_quotes_organization_id_rfq_id_vendor_id_fkey';
            columns: ['organization_id', 'rfq_id', 'vendor_id'];
            isOneToOne: false;
            referencedRelation: 'rfq_vendors';
            referencedColumns: ['organization_id', 'rfq_id', 'vendor_id'];
          },
        ];
      };
      vendors: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          legal_name: string;
          phone: string;
          email: string;
          billing_address: Json;
          delivery_address: Json;
          tax_identifier: string;
          payment_terms: string;
          categories_supplied: Json;
          notes: string;
          status: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          legal_name?: string;
          phone?: string;
          email?: string;
          billing_address?: Json;
          delivery_address?: Json;
          tax_identifier?: string;
          payment_terms?: string;
          categories_supplied?: Json;
          notes?: string;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          code?: string;
          legal_name?: string;
          phone?: string;
          email?: string;
          billing_address?: Json;
          delivery_address?: Json;
          tax_identifier?: string;
          payment_terms?: string;
          categories_supplied?: Json;
          notes?: string;
          status?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendors_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendors_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      website_assets: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          website_id: string | null;
          name: string;
          mime: string;
          bytes: number;
          width: number | null;
          height: number | null;
          alt: string;
          digest: string;
          status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id?: string | null;
          name: string;
          mime: string;
          bytes: number;
          width?: number | null;
          height?: number | null;
          alt?: string;
          digest: string;
          status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id?: string | null;
          name?: string;
          mime?: string;
          bytes?: number;
          width?: number | null;
          height?: number | null;
          alt?: string;
          digest?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'website_assets_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_assets_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_assets_organization_id_website_id_fkey';
            columns: ['organization_id', 'website_id'];
            isOneToOne: false;
            referencedRelation: 'websites';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      website_domains: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          website_id: string;
          hostname: string;
          kind: string;
          status: string;
          challenge: string;
          verified_at: string | null;
          last_checked_at: string | null;
          failure_reason: string;
          tls_status: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id: string;
          hostname: string;
          kind: string;
          status?: string;
          challenge?: string;
          verified_at?: string | null;
          last_checked_at?: string | null;
          failure_reason?: string;
          tls_status?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id?: string;
          hostname?: string;
          kind?: string;
          status?: string;
          challenge?: string;
          verified_at?: string | null;
          last_checked_at?: string | null;
          failure_reason?: string;
          tls_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'website_domains_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_domains_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_domains_organization_id_website_id_fkey';
            columns: ['organization_id', 'website_id'];
            isOneToOne: false;
            referencedRelation: 'websites';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      website_events: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          website_id: string;
          action: string;
          metadata: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id: string;
          action: string;
          metadata?: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id?: string;
          action?: string;
          metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'website_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_events_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_events_organization_id_website_id_fkey';
            columns: ['organization_id', 'website_id'];
            isOneToOne: false;
            referencedRelation: 'websites';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      website_members: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          website_id: string;
          user_id: string;
          active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id: string;
          user_id: string;
          active?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id?: string;
          user_id?: string;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'website_members_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_members_organization_id_user_id_fkey';
            columns: ['organization_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'organization_memberships';
            referencedColumns: ['organization_id', 'user_id'];
          },
          {
            foreignKeyName: 'website_members_organization_id_website_id_fkey';
            columns: ['organization_id', 'website_id'];
            isOneToOne: false;
            referencedRelation: 'websites';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      website_plan_limits: {
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
            foreignKeyName: 'website_plan_limits_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      website_platform_settings: {
        Row: {
          id: boolean;
          base_domain: string | null;
          managed_subdomain_tls: boolean;
          allowed_embeds: Json;
          disabled_components: Json;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          base_domain?: string | null;
          managed_subdomain_tls?: boolean;
          allowed_embeds?: Json;
          disabled_components?: Json;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          base_domain?: string | null;
          managed_subdomain_tls?: boolean;
          allowed_embeds?: Json;
          disabled_components?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      website_versions: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          website_id: string;
          sequence: number;
          summary: string;
          snapshot: Json;
          restored_from: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id: string;
          sequence: number;
          summary: string;
          snapshot: Json;
          restored_from?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          website_id?: string;
          sequence?: number;
          summary?: string;
          snapshot?: Json;
          restored_from?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'website_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'website_versions_organization_id_restored_from_fkey';
            columns: ['organization_id', 'restored_from'];
            isOneToOne: false;
            referencedRelation: 'website_versions';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'website_versions_organization_id_website_id_fkey';
            columns: ['organization_id', 'website_id'];
            isOneToOne: false;
            referencedRelation: 'websites';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      websites: {
        Row: {
          id: string;
          organization_id: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          name: string;
          slug: string;
          status: string;
          published_version_id: string | null;
          document: Json;
        };
        Insert: {
          id?: string;
          organization_id: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name: string;
          slug: string;
          status?: string;
          published_version_id?: string | null;
          document: Json;
        };
        Update: {
          id?: string;
          organization_id?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          name?: string;
          slug?: string;
          status?: string;
          published_version_id?: string | null;
          document?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'websites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'websites_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'websites_organization_id_published_version_id_fkey';
            columns: ['organization_id', 'published_version_id'];
            isOneToOne: false;
            referencedRelation: 'website_versions';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
      work_measurement_costs: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          measurement_id: string;
          currency: string;
          unit_rate: string;
          amount: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          measurement_id: string;
          currency: string;
          unit_rate: string;
          amount: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          measurement_id?: string;
          currency?: string;
          unit_rate?: string;
          amount?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_measurement_costs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_measurement_costs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_measurement_costs_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'work_measurement_costs_organization_id_project_id_measurem_fkey';
            columns: ['organization_id', 'project_id', 'measurement_id'];
            isOneToOne: false;
            referencedRelation: 'work_measurements';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      work_measurements: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          work_order_id: string;
          area_id: string | null;
          quantity: string;
          unit: string;
          measurement_date: string;
          note: string;
          status: string;
          decision_reason: string;
          certified_by: string | null;
          certified_at: string | null;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          work_order_id: string;
          area_id?: string | null;
          quantity: string;
          unit: string;
          measurement_date: string;
          note: string;
          status?: string;
          decision_reason?: string;
          certified_by?: string | null;
          certified_at?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          work_order_id?: string;
          area_id?: string | null;
          quantity?: string;
          unit?: string;
          measurement_date?: string;
          note?: string;
          status?: string;
          decision_reason?: string;
          certified_by?: string | null;
          certified_at?: string | null;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_measurements_certified_by_fkey';
            columns: ['certified_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_measurements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_measurements_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'work_measurements_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_measurements_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'work_measurements_organization_id_project_id_work_order_id_fkey';
            columns: ['organization_id', 'project_id', 'work_order_id'];
            isOneToOne: false;
            referencedRelation: 'subcontractor_work_orders';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
        ];
      };
      work_packages: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          area_id: string | null;
          scope_id: string | null;
          name: string;
          source_type: string;
          source_id: string | null;
          scope_state: string;
          weight: string;
          notes: string;
          version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          plan_id: string;
          area_id?: string | null;
          scope_id?: string | null;
          name: string;
          source_type?: string;
          source_id?: string | null;
          scope_state?: string;
          weight?: string;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string;
          plan_id?: string;
          area_id?: string | null;
          scope_id?: string | null;
          name?: string;
          source_type?: string;
          source_id?: string | null;
          scope_state?: string;
          weight?: string;
          notes?: string;
          version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'work_packages_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_packages_organization_id_area_id_fkey';
            columns: ['organization_id', 'area_id'];
            isOneToOne: false;
            referencedRelation: 'project_areas';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'work_packages_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'work_packages_organization_id_project_id_fkey';
            columns: ['organization_id', 'project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['organization_id', 'id'];
          },
          {
            foreignKeyName: 'work_packages_organization_id_project_id_plan_id_fkey';
            columns: ['organization_id', 'project_id', 'plan_id'];
            isOneToOne: false;
            referencedRelation: 'execution_plans';
            referencedColumns: ['organization_id', 'project_id', 'id'];
          },
          {
            foreignKeyName: 'work_packages_organization_id_scope_id_fkey';
            columns: ['organization_id', 'scope_id'];
            isOneToOne: false;
            referencedRelation: 'execution_estimate_scope_items';
            referencedColumns: ['organization_id', 'id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_membership: {
        Args: { p_membership_id: string };
        Returns: undefined;
      };
      automation_configure: {
        Args: {
          p_organization_id: string;
          p_section: string;
          p_version: number;
          p_input: Json;
        };
        Returns: number;
      };
      automation_platform_health: {
        Args: Record<string, never>;
        Returns: Json;
      };
      automation_read: {
        Args: {
          p_organization_id: string;
          p_section?: string;
          p_page?: number;
          p_id?: string;
        };
        Returns: Json;
      };
      automation_retry: {
        Args: { p_organization_id: string; p_job_id: string };
        Returns: undefined;
      };
      automation_rule_save: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_configuration: Json;
        };
        Returns: Json;
      };
      automation_test: {
        Args: {
          p_organization_id: string;
          p_rule_id: string;
          p_event_id: string;
        };
        Returns: Json;
      };
      brochure_asset_read: {
        Args: {
          p_organization_id: string;
          p_brochure_id: string;
          p_asset_id: string;
          p_version_id?: string;
        };
        Returns: Json;
      };
      brochure_document_digest: {
        Args: { p_organization_id: string; p_brochure_id: string };
        Returns: string;
      };
      brochure_grant_designer: {
        Args: { p_organization_id: string; p_user_id: string };
        Returns: undefined;
      };
      brochure_kit_save: {
        Args: {
          p_organization_id: string;
          p_version: number;
          p_proof: string;
          p_signature: string;
        };
        Returns: number;
      };
      brochure_media: {
        Args: {
          p_organization_id: string;
          p_action: string;
          p_asset_id?: string;
          p_proof?: string;
          p_signature?: string;
          p_data?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      brochure_metrics_read: {
        Args: { p_organization_id: string; p_brochure_id: string };
        Returns: Json;
      };
      brochure_pdf_read: {
        Args: {
          p_organization_id: string;
          p_brochure_id: string;
          p_version_id: string;
        };
        Returns: Json;
      };
      brochure_platform: {
        Args: {
          p_action: string;
          p_id?: string;
          p_value?: Json;
          p_page?: number;
        };
        Returns: Json;
      };
      brochure_public: {
        Args: {
          p_business: string;
          p_slug: string;
          p_action?: string;
          p_asset_id?: string;
        };
        Returns: Json;
      };
      brochure_publish: {
        Args: {
          p_organization_id: string;
          p_brochure_id: string;
          p_version: number;
          p_proof: string;
          p_signature: string;
          p_pdf: string;
          p_summary: string;
          p_restore_id?: string;
        };
        Returns: string;
      };
      brochure_read: {
        Args: {
          p_organization_id: string;
          p_brochure_id?: string;
          p_version_id?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      brochure_sitemap: { Args: { p_business: string }; Returns: Json };
      brochure_sources: {
        Args: {
          p_organization_id: string;
          p_kind: string;
          p_query?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      brochure_status: {
        Args: {
          p_organization_id: string;
          p_brochure_id: string;
          p_version: number;
          p_status: string;
        };
        Returns: undefined;
      };
      brochure_submit_lead: {
        Args: {
          p_business: string;
          p_slug: string;
          p_page: string;
          p_values: Json;
          p_honeypot?: string;
        };
        Returns: Json;
      };
      brochure_write: {
        Args: {
          p_organization_id: string;
          p_brochure_id: string;
          p_version: number;
          p_proof: string;
          p_signature: string;
        };
        Returns: Json;
      };
      catalog_snapshot: {
        Args: { p_organization_id: string; p_pricing?: boolean };
        Returns: Json;
      };
      change_order_command: {
        Args: { p_message: string; p_signature: string };
        Returns: string;
      };
      change_order_configuration: {
        Args: {
          p_organization_id: string;
          p_contract_id: string;
          p_item_id: string;
        };
        Returns: Json;
      };
      change_order_pricing_context: {
        Args: { p_message: string; p_signature: string };
        Returns: Json;
      };
      commercial_search: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_query?: string;
          p_page?: number;
          p_status?: string;
          p_parent_id?: string;
        };
        Returns: Json;
      };
      commit_quotation: {
        Args: { p_message: string; p_signature: string };
        Returns: string;
      };
      company_application_decide: {
        Args: { p_application_id: string; p_action: string; p_note?: string };
        Returns: Json;
      };
      company_application_submit: { Args: { p_input: Json }; Returns: string };
      company_applications_mine: { Args: Record<string, never>; Returns: Json };
      company_applications_review: {
        Args: { p_status?: string; p_page?: number };
        Returns: Json;
      };
      company_onboarding_policy: { Args: Record<string, never>; Returns: Json };
      company_onboarding_set_policy: {
        Args: { p_approval_required: boolean };
        Returns: Json;
      };
      contract_create: {
        Args: { p_organization_id: string; p_revision_id: string };
        Returns: string;
      };
      contract_transition: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_version: number;
          p_status: string;
          p_reason?: string;
        };
        Returns: string;
      };
      create_organization: { Args: { p_input: Json }; Returns: string };
      crm_assignees: {
        Args: { p_organization_id: string; p_query?: string; p_page?: number };
        Returns: Json;
      };
      crm_command: {
        Args: { p_organization_id: string; p_action: string; p_input: Json };
        Returns: string;
      };
      crm_convert: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: Json;
      };
      crm_duplicates: {
        Args: { p_organization_id: string; p_phone: string; p_email: string };
        Returns: Json;
      };
      crm_save: {
        Args: { p_organization_id: string; p_entity: string; p_input: Json };
        Returns: string;
      };
      crm_search: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_filter?: Json;
          p_page?: number;
        };
        Returns: Json;
      };
      deployment_readiness: { Args: Record<string, never>; Returns: boolean };
      employee_invitation_accept: {
        Args: { p_invitation_id: string };
        Returns: string;
      };
      employee_invitation_create: {
        Args: {
          p_organization_id: string;
          p_email: string;
          p_role_ids: string[];
          p_branch_id?: string;
        };
        Returns: string;
      };
      employee_invitation_resend: {
        Args: { p_organization_id: string; p_invitation_id: string };
        Returns: undefined;
      };
      employee_invitation_revoke: {
        Args: { p_organization_id: string; p_invitation_id: string };
        Returns: undefined;
      };
      employee_invitations_list: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      employee_invitations_mine: { Args: Record<string, never>; Returns: Json };
      execution_configure: {
        Args: { p_organization_id: string; p_entity: string; p_input: Json };
        Returns: string;
      };
      execution_contracts: {
        Args: {
          p_organization_id: string;
          p_project_id?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      execution_cost_dashboard: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      execution_cost_record: {
        Args: { p_organization_id: string; p_input: Json };
        Returns: string;
      };
      execution_cost_report: {
        Args: { p_organization_id: string; p_project_id: string };
        Returns: Json;
      };
      execution_detail: {
        Args: { p_organization_id: string; p_entity: string; p_id: string };
        Returns: Json;
      };
      execution_document: {
        Args: {
          p_organization_id: string;
          p_entity: string;
          p_id: string;
          p_vendor_id?: string;
        };
        Returns: Json;
      };
      execution_estimate_command: {
        Args: { p_organization_id: string; p_action: string; p_input: Json };
        Returns: string;
      };
      execution_estimate_demand: {
        Args: { p_organization_id: string; p_revision_id: string };
        Returns: Json;
      };
      execution_line_remove: {
        Args: {
          p_organization_id: string;
          p_revision_id: string;
          p_line_id: string;
          p_version: number;
        };
        Returns: string;
      };
      execution_line_save: {
        Args: {
          p_organization_id: string;
          p_revision_id: string;
          p_input: Json;
        };
        Returns: string;
      };
      execution_po_create: {
        Args: { p_organization_id: string; p_input: Json };
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
      gst_document: { Args: { p_org: string; p_id: string }; Returns: Json };
      gst_document_finalize: {
        Args: { p_org: string; p_id: string; p_version: number };
        Returns: string;
      };
      gst_document_save: {
        Args: { p_org: string; p_input: Json };
        Returns: string;
      };
      gst_documents: {
        Args: { p_org: string; p_kind?: string };
        Returns: Json;
      };
      gst_profile_read: { Args: { p_org: string }; Returns: Json };
      gst_profile_save: {
        Args: { p_org: string; p_input: Json };
        Returns: undefined;
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
      organization_context: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
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
        Args: { p_user_id: string; p_organization_id: string; p_role_id: string };
        Returns: string;
      };
      platform_user_directory: {
        Args: {
          p_query?: string;
          p_kind?: string;
          p_status?: string;
          p_industry_id?: string;
          p_page?: number;
        };
        Returns: Json;
      };
      platform_user_profile: { Args: { p_user_id: string }; Returns: Json };
      platform_user_status_set: {
        Args: { p_user_id: string; p_status: string };
        Returns: undefined;
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
      project_site_my_projects: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      project_site_read: {
        Args: { p_organization_id: string; p_project_id: string };
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
      quotation_item_configuration: {
        Args: {
          p_organization_id: string;
          p_item_id: string;
          p_branch_id?: string;
        };
        Returns: Json;
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
