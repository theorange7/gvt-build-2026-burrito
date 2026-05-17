output "account_name" { value = azurerm_storage_account.main.name }
output "account_id" { value = azurerm_storage_account.main.id }
output "primary_access_key" {
  value     = azurerm_storage_account.main.primary_access_key
  sensitive = true
}
output "tables_endpoint" { value = azurerm_storage_account.main.primary_table_endpoint }
output "primary_connection_string" {
  value     = azurerm_storage_account.main.primary_connection_string
  sensitive = true
}
output "wraps_container_name" { value = azurerm_storage_container.wraps.name }
output "share_links_table_name" { value = azurerm_storage_table.share_links.name }
