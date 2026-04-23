import Config

config :pmd_messaging,
  port: String.to_integer(System.get_env("PORT") || "4100"),
  supabase_url: System.fetch_env!("SUPABASE_URL"),
  supabase_service_role_key: System.fetch_env!("SUPABASE_SERVICE_ROLE_KEY")
