variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "suffix" { type = string }
variable "app_insights_connection_string" {
  type      = string
  sensitive = true
}
variable "app_insights_instrumentation_key" {
  type      = string
  sensitive = true
}
variable "storage_account_name" { type = string }
variable "storage_account_primary_access_key" {
  type      = string
  sensitive = true
}
variable "service_bus_namespace_fqdn" { type = string }
variable "service_bus_queue_name" { type = string }
variable "tables_endpoint" { type = string }
variable "key_vault_uri" { type = string }
variable "wrap_max_concurrency" { type = number }
variable "wrap_per_install_limit" { type = number }
variable "wrap_result_ttl_hours" { type = number }
variable "wrap_register_rate_limit_per_hour" { type = number }
variable "wrap_max_deliveries" { type = number }
variable "wrap_tables_jobs" { type = string }
variable "wrap_tables_results" { type = string }
variable "allowed_origins" { type = string }
variable "env_mode" { type = string }
variable "tags" { type = map(string) }
