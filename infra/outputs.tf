output "function_app_hostname" {
  description = "Default hostname of the Azure Functions app. Use as NEXT_PUBLIC_WRAP_API_URL (append /api)."
  value       = "https://${module.functions.default_hostname}/api"
}

output "function_app_name" {
  description = "Resource name of the Azure Functions app (for CI/CD deploy targets)."
  value       = module.functions.app_name
}

output "resource_group_name" {
  description = "Resource group containing all deployed resources."
  value       = azurerm_resource_group.main.name
}

output "service_bus_namespace_fqdn" {
  description = "Fully-qualified Service Bus namespace hostname."
  value       = module.service_bus.namespace_fqdn
}

output "storage_tables_endpoint" {
  description = "Table Storage endpoint URL (for AZURE_TABLES_ENDPOINT)."
  value       = module.storage.tables_endpoint
}

output "key_vault_uri" {
  description = "Key Vault URI (for secret references in app settings)."
  value       = module.key_vault.vault_uri
}

output "app_insights_connection_string" {
  description = "Application Insights connection string."
  value       = module.monitoring.connection_string
  sensitive   = true
}
