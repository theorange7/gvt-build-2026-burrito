output "app_name" { value = azurerm_function_app_flex_consumption.main.name }
output "default_hostname" { value = azurerm_function_app_flex_consumption.main.default_hostname }
output "principal_id" { value = azurerm_function_app_flex_consumption.main.identity[0].principal_id }
output "app_id" { value = azurerm_function_app_flex_consumption.main.id }
