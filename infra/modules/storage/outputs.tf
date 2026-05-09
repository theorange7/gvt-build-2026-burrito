output "account_name"          { value = azurerm_storage_account.main.name }
output "account_id"            { value = azurerm_storage_account.main.id }
output "primary_access_key"    {
  value     = azurerm_storage_account.main.primary_access_key
  sensitive = true
}
output "tables_endpoint"       { value = azurerm_storage_account.main.primary_table_endpoint }
output "primary_connection_string" {
  value     = azurerm_storage_account.main.primary_connection_string
  sensitive = true
}
