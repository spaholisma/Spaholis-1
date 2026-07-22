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
      admin_calendar_entries: {
        Row: {
          calendar_type: string
          color: string | null
          created_at: string
          duration_minutes: number
          end_date: string | null
          end_time: string | null
          entry_date: string
          group_id: string | null
          id: string
          blocks_availability: boolean
          is_all_day: boolean
          is_offsite: boolean
          notes: string | null
          offsite_location: string | null
          recurrence: string
          recurrence_until: string | null
          room_id: string | null
          series_id: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          calendar_type?: string
          color?: string | null
          created_at?: string
          duration_minutes?: number
          end_date?: string | null
          end_time?: string | null
          entry_date: string
          group_id?: string | null
          id?: string
          blocks_availability?: boolean
          is_all_day?: boolean
          is_offsite?: boolean
          notes?: string | null
          offsite_location?: string | null
          recurrence?: string
          recurrence_until?: string | null
          room_id?: string | null
          series_id?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          calendar_type?: string
          color?: string | null
          created_at?: string
          duration_minutes?: number
          end_date?: string | null
          end_time?: string | null
          entry_date?: string
          group_id?: string | null
          id?: string
          blocks_availability?: boolean
          is_all_day?: boolean
          is_offsite?: boolean
          notes?: string | null
          offsite_location?: string | null
          recurrence?: string
          recurrence_until?: string | null
          room_id?: string | null
          series_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_calendar_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "calendar_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_calendar_entries_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendee_labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          result: string | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          result?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          result?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bac_link_claims: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          id: string
          link_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          id?: string
          link_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bac_link_claims_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bac_link_claims_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "bac_link_claim_counts"
            referencedColumns: ["link_id"]
          },
          {
            foreignKeyName: "bac_link_claims_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "bac_payment_links"
            referencedColumns: ["id"]
          },
        ]
      }
      bac_payment_links: {
        Row: {
          amount: number
          assigned_at: string | null
          assigned_booking_id: string | null
          created_at: string
          id: string
          notes: string | null
          status: string
          times_used: number
          updated_at: string
          url: string
          used_at: string | null
        }
        Insert: {
          amount: number
          assigned_at?: string | null
          assigned_booking_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          times_used?: number
          updated_at?: string
          url: string
          used_at?: string | null
        }
        Update: {
          amount?: number
          assigned_at?: string | null
          assigned_booking_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          times_used?: number
          updated_at?: string
          url?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bac_payment_links_assigned_booking_id_fkey"
            columns: ["assigned_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          applies_to: string | null
          blocked_date: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          applies_to?: string | null
          blocked_date: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          applies_to?: string | null
          blocked_date?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author: string | null
          content: Json
          content_es: Json
          cover_image: string | null
          created_at: string
          excerpt: string | null
          excerpt_es: string | null
          featured: boolean
          gallery_images: Json
          id: string
          publish_date: string | null
          seo_description: string | null
          seo_description_es: string | null
          seo_title: string | null
          seo_title_es: string | null
          slug: string
          sort_order: number
          status: string
          tags: string[]
          title: string
          title_es: string | null
          updated_at: string
        }
        Insert: {
          author?: string | null
          content?: Json
          content_es?: Json
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          excerpt_es?: string | null
          featured?: boolean
          gallery_images?: Json
          id?: string
          publish_date?: string | null
          seo_description?: string | null
          seo_description_es?: string | null
          seo_title?: string | null
          seo_title_es?: string | null
          slug: string
          sort_order?: number
          status?: string
          tags?: string[]
          title: string
          title_es?: string | null
          updated_at?: string
        }
        Update: {
          author?: string | null
          content?: Json
          content_es?: Json
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          excerpt_es?: string | null
          featured?: boolean
          gallery_images?: Json
          id?: string
          publish_date?: string | null
          seo_description?: string | null
          seo_description_es?: string | null
          seo_title?: string | null
          seo_title_es?: string | null
          slug?: string
          sort_order?: number
          status?: string
          tags?: string[]
          title?: string
          title_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_card_authorizations: {
        Row: {
          authorization_text: string | null
          authorized: boolean
          booking_id: string
          card_brand: string | null
          card_encrypted: string
          card_expiry: string | null
          card_last4: string | null
          cardholder_name: string | null
          created_at: string
          id: string
        }
        Insert: {
          authorization_text?: string | null
          authorized?: boolean
          booking_id: string
          card_brand?: string | null
          card_encrypted: string
          card_expiry?: string | null
          card_last4?: string | null
          cardholder_name?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          authorization_text?: string | null
          authorized?: boolean
          booking_id?: string
          card_brand?: string | null
          card_encrypted?: string
          card_expiry?: string | null
          card_last4?: string | null
          cardholder_name?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_card_authorizations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          booking_time: string
          blocks_availability: boolean
          card_authorization: Json | null
          coupon_code: string | null
          created_at: string
          discount_amount: number | null
          end_time: string | null
          guest_email: string | null
          group_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          intake_form: Json | null
          notes: string | null
          notification_sent_at: string | null
          offsite_location: string | null
          payment_id: string | null
          room_id: string | null
          secondary_room_id: string | null
          service_id: string | null
          staff_id: string | null
          start_time: string | null
          status: string
          title: string | null
          total_price: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          booking_date: string
          booking_time: string
          blocks_availability?: boolean
          card_authorization?: Json | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          end_time?: string | null
          guest_email?: string | null
          group_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          intake_form?: Json | null
          notes?: string | null
          notification_sent_at?: string | null
          offsite_location?: string | null
          payment_id?: string | null
          room_id?: string | null
          secondary_room_id?: string | null
          service_id?: string | null
          staff_id?: string | null
          start_time?: string | null
          status?: string
          title?: string | null
          total_price?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          booking_date?: string
          booking_time?: string
          blocks_availability?: boolean
          card_authorization?: Json | null
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          end_time?: string | null
          guest_email?: string | null
          group_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          intake_form?: Json | null
          notes?: string | null
          notification_sent_at?: string | null
          offsite_location?: string | null
          payment_id?: string | null
          room_id?: string | null
          secondary_room_id?: string | null
          service_id?: string | null
          staff_id?: string | null
          start_time?: string | null
          status?: string
          title?: string | null
          total_price?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_secondary_room_id_fkey"
            columns: ["secondary_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          close_time: string
          is_closed: boolean
          open_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          close_time?: string
          is_closed?: boolean
          open_time?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          close_time?: string
          is_closed?: boolean
          open_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      calendar_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      class_bookings: {
        Row: {
          coupon_code: string | null
          created_at: string
          discount_amount: number | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          label_id: string | null
          notification_sent_at: string | null
          payment_id: string | null
          payment_method: string | null
          payment_status: string | null
          paypal_order_id: string | null
          schedule_id: string
          status: string
          total_price: number | null
          user_id: string | null
          user_offering_id: string | null
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          label_id?: string | null
          notification_sent_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          paypal_order_id?: string | null
          schedule_id: string
          status?: string
          total_price?: number | null
          user_id?: string | null
          user_offering_id?: string | null
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          discount_amount?: number | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          label_id?: string | null
          notification_sent_at?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          paypal_order_id?: string | null
          schedule_id?: string
          status?: string
          total_price?: number | null
          user_id?: string | null
          user_offering_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_bookings_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "attendee_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bookings_user_offering_id_fkey"
            columns: ["user_offering_id"]
            isOneToOne: false
            referencedRelation: "user_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule: {
        Row: {
          class_id: string
          created_at: string
          end_time: string
          id: string
          is_cancelled: boolean
          spots_remaining: number
          start_time: string
        }
        Insert: {
          class_id: string
          created_at?: string
          end_time: string
          id?: string
          is_cancelled?: boolean
          spots_remaining: number
          start_time: string
        }
        Update: {
          class_id?: string
          created_at?: string
          end_time?: string
          id?: string
          is_cancelled?: boolean
          spots_remaining?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule_template: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          duration_minutes: number
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_template_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          category: string
          created_at: string
          description: string | null
          description_es: string | null
          duration_minutes: number
          id: string
          image_url: string | null
          instructor: string | null
          instructor_es: string | null
          is_active: boolean
          is_recurring: boolean
          location: string | null
          location_es: string | null
          max_capacity: number
          payment_link: string | null
          price: number
          recurrence_rule: string | null
          requires_payment: boolean
          title: string
          title_es: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          description_es?: string | null
          duration_minutes: number
          id?: string
          image_url?: string | null
          instructor?: string | null
          instructor_es?: string | null
          is_active?: boolean
          is_recurring?: boolean
          location?: string | null
          location_es?: string | null
          max_capacity?: number
          payment_link?: string | null
          price?: number
          recurrence_rule?: string | null
          requires_payment?: boolean
          title: string
          title_es?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          description_es?: string | null
          duration_minutes?: number
          id?: string
          image_url?: string | null
          instructor?: string | null
          instructor_es?: string | null
          is_active?: boolean
          is_recurring?: boolean
          location?: string | null
          location_es?: string | null
          max_capacity?: number
          payment_link?: string | null
          price?: number
          recurrence_rule?: string | null
          requires_payment?: boolean
          title?: string
          title_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          sort_order: number
          source_id: string
          source_table: string
          tags: string[]
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          sort_order?: number
          source_id: string
          source_table: string
          tags?: string[]
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          source_id?: string
          source_table?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          image: string | null
          intent: string | null
          intent_es: string | null
          is_active: boolean
          sort_order: number
          tagline: string | null
          tagline_es: string | null
          title: string
          title_es: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          intent?: string | null
          intent_es?: string | null
          is_active?: boolean
          sort_order?: number
          tagline?: string | null
          tagline_es?: string | null
          title: string
          title_es?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          intent?: string | null
          intent_es?: string | null
          is_active?: boolean
          sort_order?: number
          tagline?: string | null
          tagline_es?: string | null
          title?: string
          title_es?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      content_relationships: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          relation_type: string
          sort_order: number
          source_id: string
          source_table: string
          target_id: string
          target_table: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          relation_type?: string
          sort_order?: number
          source_id: string
          source_table: string
          target_id: string
          target_table: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          relation_type?: string
          sort_order?: number
          source_id?: string
          source_table?: string
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      content_tags: {
        Row: {
          content_id: string
          content_table: string
          created_at: string
          id: string
          sort_order: number
          tag_id: string
        }
        Insert: {
          content_id: string
          content_table: string
          created_at?: string
          id?: string
          sort_order?: number
          tag_id: string
        }
        Update: {
          content_id?: string
          content_table?: string
          created_at?: string
          id?: string
          sort_order?: number
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          restricted_class_ids: string[] | null
          restricted_package_ids: string[] | null
          restricted_product_ids: string[] | null
          restricted_service_ids: string[] | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          restricted_class_ids?: string[] | null
          restricted_package_ids?: string[] | null
          restricted_product_ids?: string[] | null
          restricted_service_ids?: string[] | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          restricted_class_ids?: string[] | null
          restricted_package_ids?: string[] | null
          restricted_product_ids?: string[] | null
          restricted_service_ids?: string[] | null
        }
        Relationships: []
      }
      custom_retreat_inquiries: {
        Row: {
          budget_range: string | null
          created_at: string
          email: string
          flexible_dates: boolean | null
          full_name: string
          group_type: string | null
          id: string
          length_of_stay: string | null
          phone: string | null
          preferred_activities: string[] | null
          preferred_dates: string | null
          retreat_vision: string[] | null
          special_requests: string | null
          status: string
          updated_at: string
        }
        Insert: {
          budget_range?: string | null
          created_at?: string
          email: string
          flexible_dates?: boolean | null
          full_name: string
          group_type?: string | null
          id?: string
          length_of_stay?: string | null
          phone?: string | null
          preferred_activities?: string[] | null
          preferred_dates?: string | null
          retreat_vision?: string[] | null
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          budget_range?: string | null
          created_at?: string
          email?: string
          flexible_dates?: boolean | null
          full_name?: string
          group_type?: string | null
          id?: string
          length_of_stay?: string | null
          phone?: string | null
          preferred_activities?: string[] | null
          preferred_dates?: string | null
          retreat_vision?: string[] | null
          special_requests?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      experience_availability: {
        Row: {
          availability_date: string
          booked_count: number
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          max_capacity: number
          notes: string | null
          service_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          availability_date: string
          booked_count?: number
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          max_capacity?: number
          notes?: string | null
          service_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          availability_date?: string
          booked_count?: number
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          max_capacity?: number
          notes?: string | null
          service_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_availability_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_bookings: {
        Row: {
          availability_id: string
          created_at: string
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          notes: string | null
          number_of_guests: number
          payment_id: string | null
          status: string
          total_price: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          availability_id: string
          created_at?: string
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          number_of_guests?: number
          payment_id?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          availability_id?: string
          created_at?: string
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          notes?: string | null
          number_of_guests?: number
          payment_id?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_bookings_availability_id_fkey"
            columns: ["availability_id"]
            isOneToOne: false
            referencedRelation: "experience_availability"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_categories: {
        Row: {
          created_at: string
          description: string | null
          description_es: string | null
          id: string
          is_visible: boolean
          name: string
          name_es: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_es?: string | null
          id?: string
          is_visible?: boolean
          name: string
          name_es?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          description_es?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          name_es?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: Json | null
          answer_es: Json | null
          answer_html: string | null
          answer_html_es: string | null
          category_id: string | null
          created_at: string
          id: string
          is_visible: boolean
          question: string
          question_es: string | null
          related_product_id: string | null
          related_service_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer?: Json | null
          answer_es?: Json | null
          answer_html?: string | null
          answer_html_es?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          question: string
          question_es?: string | null
          related_product_id?: string | null
          related_service_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: Json | null
          answer_es?: Json | null
          answer_html?: string | null
          answer_html_es?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          question?: string
          question_es?: string | null
          related_product_id?: string | null
          related_service_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "faq_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          initial_value: number
          is_active: boolean | null
          message: string | null
          payment_id: string | null
          purchaser_email: string | null
          recipient_email: string | null
          recipient_name: string | null
          remaining_value: number
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          initial_value: number
          is_active?: boolean | null
          message?: string | null
          payment_id?: string | null
          purchaser_email?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          remaining_value: number
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          initial_value?: number
          is_active?: boolean | null
          message?: string | null
          payment_id?: string | null
          purchaser_email?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          remaining_value?: number
        }
        Relationships: []
      }
      loyalty_rewards: {
        Row: {
          discount_percentage: number
          earned_at: string
          expires_at: string | null
          id: string
          is_used: boolean
          used_at: string | null
          user_id: string
        }
        Insert: {
          discount_percentage: number
          earned_at?: string
          expires_at?: string | null
          id?: string
          is_used?: boolean
          used_at?: string | null
          user_id: string
        }
        Update: {
          discount_percentage?: number
          earned_at?: string
          expires_at?: string | null
          id?: string
          is_used?: boolean
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      loyalty_settings: {
        Row: {
          discount_percentage: number
          id: string
          is_active: boolean
          updated_at: string
          visits_required: number
        }
        Insert: {
          discount_percentage?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          visits_required?: number
        }
        Update: {
          discount_percentage?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          visits_required?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offering_eligible_classes: {
        Row: {
          class_id: string
          created_at: string
          id: string
          offering_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          offering_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_eligible_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_eligible_classes_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_redemptions: {
        Row: {
          class_booking_id: string | null
          created_at: string
          credits_used: number
          id: string
          notes: string | null
          redemption_type: string
          user_id: string | null
          user_offering_id: string
        }
        Insert: {
          class_booking_id?: string | null
          created_at?: string
          credits_used?: number
          id?: string
          notes?: string | null
          redemption_type: string
          user_id?: string | null
          user_offering_id: string
        }
        Update: {
          class_booking_id?: string | null
          created_at?: string
          credits_used?: number
          id?: string
          notes?: string | null
          redemption_type?: string
          user_id?: string | null
          user_offering_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_redemptions_user_offering_id_fkey"
            columns: ["user_offering_id"]
            isOneToOne: false
            referencedRelation: "user_offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          created_at: string
          credits: number | null
          currency: string
          description: string | null
          description_es: string | null
          duration_days: number | null
          id: string
          is_unlimited: boolean
          name: string
          name_es: string | null
          payment_link: string | null
          price: number
          sort_order: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits?: number | null
          currency?: string
          description?: string | null
          description_es?: string | null
          duration_days?: number | null
          id?: string
          is_unlimited?: boolean
          name: string
          name_es?: string | null
          payment_link?: string | null
          price?: number
          sort_order?: number
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number | null
          currency?: string
          description?: string | null
          description_es?: string | null
          duration_days?: number | null
          id?: string
          is_unlimited?: boolean
          name?: string
          name_es?: string | null
          payment_link?: string | null
          price?: number
          sort_order?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          compare_at_price: number | null
          cover_image: string | null
          created_at: string
          currency: string
          description: Json
          description_es: Json
          external_url: string | null
          featured: boolean
          gallery_images: Json
          id: string
          name: string
          name_es: string | null
          price: number
          seo_description: string | null
          seo_description_es: string | null
          seo_title: string | null
          seo_title_es: string | null
          short_description: string | null
          short_description_es: string | null
          sku: string | null
          slug: string
          sort_order: number
          status: string
          stock: number | null
          track_inventory: boolean
          updated_at: string
        }
        Insert: {
          category?: string | null
          compare_at_price?: number | null
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: Json
          description_es?: Json
          external_url?: string | null
          featured?: boolean
          gallery_images?: Json
          id?: string
          name: string
          name_es?: string | null
          price?: number
          seo_description?: string | null
          seo_description_es?: string | null
          seo_title?: string | null
          seo_title_es?: string | null
          short_description?: string | null
          short_description_es?: string | null
          sku?: string | null
          slug: string
          sort_order?: number
          status?: string
          stock?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Update: {
          category?: string | null
          compare_at_price?: number | null
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: Json
          description_es?: Json
          external_url?: string | null
          featured?: boolean
          gallery_images?: Json
          id?: string
          name?: string
          name_es?: string | null
          price?: number
          seo_description?: string | null
          seo_description_es?: string | null
          seo_title?: string | null
          seo_title_es?: string | null
          short_description?: string | null
          short_description_es?: string | null
          sku?: string | null
          slug?: string
          sort_order?: number
          status?: string
          stock?: number | null
          track_inventory?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          total_visits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          total_visits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          total_visits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      retreat_inquiries: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          message: string | null
          number_of_guests: number | null
          occupancy_type: string | null
          phone: string | null
          preferred_start_date: string | null
          retreat_id: string | null
          retreat_title: string
          status: string
          with_accommodation: boolean | null
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          message?: string | null
          number_of_guests?: number | null
          occupancy_type?: string | null
          phone?: string | null
          preferred_start_date?: string | null
          retreat_id?: string | null
          retreat_title: string
          status?: string
          with_accommodation?: boolean | null
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          message?: string | null
          number_of_guests?: number | null
          occupancy_type?: string | null
          phone?: string | null
          preferred_start_date?: string | null
          retreat_id?: string | null
          retreat_title?: string
          status?: string
          with_accommodation?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "retreat_inquiries_retreat_id_fkey"
            columns: ["retreat_id"]
            isOneToOne: false
            referencedRelation: "retreats"
            referencedColumns: ["id"]
          },
        ]
      }
      retreats: {
        Row: {
          booking_policies: string | null
          booking_policies_es: string | null
          created_at: string
          deposit_percentage: number
          description: string | null
          description_es: string | null
          duration_days: number
          gallery_images: Json | null
          id: string
          image_url: string | null
          inclusions: Json | null
          inclusions_es: Json | null
          is_active: boolean
          itinerary: Json | null
          itinerary_es: Json | null
          pricing_tiers: Json
          short_description: string | null
          short_description_es: string | null
          slug: string
          sort_order: number
          title: string
          title_es: string | null
          type: string
          updated_at: string
        }
        Insert: {
          booking_policies?: string | null
          booking_policies_es?: string | null
          created_at?: string
          deposit_percentage?: number
          description?: string | null
          description_es?: string | null
          duration_days?: number
          gallery_images?: Json | null
          id?: string
          image_url?: string | null
          inclusions?: Json | null
          inclusions_es?: Json | null
          is_active?: boolean
          itinerary?: Json | null
          itinerary_es?: Json | null
          pricing_tiers?: Json
          short_description?: string | null
          short_description_es?: string | null
          slug: string
          sort_order?: number
          title: string
          title_es?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          booking_policies?: string | null
          booking_policies_es?: string | null
          created_at?: string
          deposit_percentage?: number
          description?: string | null
          description_es?: string | null
          duration_days?: number
          gallery_images?: Json | null
          id?: string
          image_url?: string | null
          inclusions?: Json | null
          inclusions_es?: Json | null
          is_active?: boolean
          itinerary?: Json | null
          itinerary_es?: Json | null
          pricing_tiers?: Json
          short_description?: string | null
          short_description_es?: string | null
          slug?: string
          sort_order?: number
          title?: string
          title_es?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          couples_capable: boolean
          created_at: string
          forbidden_categories: string[]
          id: string
          is_active: boolean
          name: string
          pairs_with_room_id: string | null
        }
        Insert: {
          couples_capable?: boolean
          created_at?: string
          forbidden_categories?: string[]
          id?: string
          is_active?: boolean
          name: string
          pairs_with_room_id?: string | null
        }
        Update: {
          couples_capable?: boolean
          created_at?: string
          forbidden_categories?: string[]
          id?: string
          is_active?: boolean
          name?: string
          pairs_with_room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_pairs_with_room_id_fkey"
            columns: ["pairs_with_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          capacity: number | null
          category: string
          certificate: boolean | null
          created_at: string
          description: string | null
          description_es: string | null
          description_rich: Json
          description_rich_es: Json
          duration_minutes: number
          gallery_images: Json
          gallery_images_es: Json
          id: string
          image_url: string | null
          is_active: boolean
          is_addon: boolean
          is_online: boolean | null
          level: number | null
          max_participants: number | null
          meeting_url: string | null
          price: number
          requires_payment: boolean | null
          sessions: number | null
          sort_order: number
          title: string
          title_es: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          category: string
          certificate?: boolean | null
          created_at?: string
          description?: string | null
          description_es?: string | null
          description_rich?: Json
          description_rich_es?: Json
          duration_minutes: number
          gallery_images?: Json
          gallery_images_es?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_addon?: boolean
          is_online?: boolean | null
          level?: number | null
          max_participants?: number | null
          meeting_url?: string | null
          price: number
          requires_payment?: boolean | null
          sessions?: number | null
          sort_order?: number
          title: string
          title_es?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          category?: string
          certificate?: boolean | null
          created_at?: string
          description?: string | null
          description_es?: string | null
          description_rich?: Json
          description_rich_es?: Json
          duration_minutes?: number
          gallery_images?: Json
          gallery_images_es?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_addon?: boolean
          is_online?: boolean | null
          level?: number | null
          max_participants?: number | null
          meeting_url?: string | null
          price?: number
          requires_payment?: boolean | null
          sessions?: number | null
          sort_order?: number
          title?: string
          title_es?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: Json
          content_es: Json
          id: string
          section_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          content_es?: Json
          id?: string
          section_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          content_es?: Json
          id?: string
          section_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      spa_package_items: {
        Row: {
          created_at: string
          id: string
          package_id: string
          position: number
          treatment_name: string
          treatment_name_es: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          position?: number
          treatment_name: string
          treatment_name_es?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          position?: number
          treatment_name?: string
          treatment_name_es?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spa_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "spa_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      spa_packages: {
        Row: {
          booking_url: string | null
          created_at: string
          description: string | null
          description_es: string | null
          description_rich: Json
          description_rich_es: Json
          duration_label: string | null
          duration_label_es: string | null
          gallery_images: Json
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          name_es: string | null
          position: number
          price: number
          service_id: string | null
          updated_at: string
        }
        Insert: {
          booking_url?: string | null
          created_at?: string
          description?: string | null
          description_es?: string | null
          description_rich?: Json
          description_rich_es?: Json
          duration_label?: string | null
          duration_label_es?: string | null
          gallery_images?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          name_es?: string | null
          position?: number
          price?: number
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          booking_url?: string | null
          created_at?: string
          description?: string | null
          description_es?: string | null
          description_rich?: Json
          description_rich_es?: Json
          duration_label?: string | null
          duration_label_es?: string | null
          gallery_images?: Json
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          name_es?: string | null
          position?: number
          price?: number
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spa_packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          description_es: string | null
          id: string
          label: string
          label_es: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          description_es?: string | null
          id?: string
          label: string
          label_es?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          description_es?: string | null
          id?: string
          label?: string
          label_es?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_offerings: {
        Row: {
          access_token: string | null
          code: string | null
          created_at: string
          credits_remaining: number | null
          credits_total: number | null
          expires_at: string | null
          granted_by: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          is_unlimited: boolean
          name_snapshot: string
          notes: string | null
          offering_id: string
          payment_id: string | null
          price_paid: number
          source: string
          starts_at: string
          status: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          code?: string | null
          created_at?: string
          credits_remaining?: number | null
          credits_total?: number | null
          expires_at?: string | null
          granted_by?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_unlimited?: boolean
          name_snapshot: string
          notes?: string | null
          offering_id: string
          payment_id?: string | null
          price_paid?: number
          source?: string
          starts_at?: string
          status?: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          code?: string | null
          created_at?: string
          credits_remaining?: number | null
          credits_total?: number | null
          expires_at?: string | null
          granted_by?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_unlimited?: boolean
          name_snapshot?: string
          notes?: string | null
          offering_id?: string
          payment_id?: string | null
          price_paid?: number
          source?: string
          starts_at?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_offerings_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          certificate_url: string | null
          completed: boolean | null
          completed_sessions: number | null
          created_at: string | null
          id: string
          service_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          certificate_url?: string | null
          completed?: boolean | null
          completed_sessions?: number | null
          created_at?: string | null
          id?: string
          service_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          certificate_url?: string | null
          completed?: boolean | null
          completed_sessions?: number | null
          created_at?: string | null
          id?: string
          service_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      bac_link_claim_counts: {
        Row: {
          amount: number | null
          claim_count: number | null
          link_id: string | null
          times_used: number | null
        }
        Relationships: []
      }
      bac_payment_link_counts: {
        Row: {
          amount: number | null
          assigned: number | null
          available: number | null
          total: number | null
          used: number | null
          void: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_book_class_with_offering: {
        Args: {
          _guest_email?: string
          _guest_name?: string
          _guest_phone?: string
          _schedule_id: string
          _user_offering_id: string
        }
        Returns: Json
      }
      book_class_with_membership_token: {
        Args: { _schedule_id: string; _token: string }
        Returns: Json
      }
      card_luhn_ok: { Args: { _num: string }; Returns: boolean }
      claim_bac_payment_link: {
        Args: { _amount: number; _booking_id: string }
        Returns: {
          amount: number
          id: string
          url: string
        }[]
      }
      create_membership_order: {
        Args: {
          _guest_email: string
          _guest_name: string
          _guest_phone?: string
          _notes?: string
          _offering_id: string
        }
        Returns: Json
      }
      decrement_class_spot: { Args: { _schedule_id: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      duplicate_booking: { Args: { _booking_id: string }; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_availability_blocks: {
        Args: { _from: string; _to: string }
        Returns: {
          block_end: string
          block_start: string
        }[]
      }
      get_treatment_bookings: {
        Args: { _from: string; _to: string }
        Returns: {
          id: string
          title: string
          guest_name: string
          service_title: string
          service_type: string
          duration_minutes: number
          booking_date: string
          booking_time: string
          status: string
          room_id: string
          group_id: string
        }[]
      }
      get_internal_busy_intervals: {
        Args: { _from: string; _to: string }
        Returns: {
          busy_end: string
          busy_start: string
          room_id: string
        }[]
      }
      get_user_offering_by_token: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_class_spot: { Args: { _schedule_id: string }; Returns: number }
      increment_coupon_usage: { Args: { _coupon_id: string }; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      parse_duration_label: { Args: { _label: string }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      redeem_offering: {
        Args: { _class_booking_id?: string; _user_offering_id: string }
        Returns: Json
      }
      reveal_card_authorization: {
        Args: { _booking_id: string }
        Returns: Json
      }
      save_card_authorization: {
        Args: {
          _auth_text: string
          _authorized: boolean
          _booking_id: string
          _card_number: string
          _cardholder: string
          _expiry: string
        }
        Returns: Json
      }
      search_known_contacts: { Args: { _q: string }; Returns: Json }
    }
    Enums: {
      app_role: "super_admin" | "manager" | "client" | "coordinator" | "viewer"
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
      app_role: ["super_admin", "manager", "client", "coordinator", "viewer"],
    },
  },
} as const
