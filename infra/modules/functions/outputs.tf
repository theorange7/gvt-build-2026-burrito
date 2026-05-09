output "app_name"        { value = azurerm_linux_function_app.main.name }
output "default_hostname" { value = azurerm_linux_function_app.main.default_hostname }
output "principal_id"    { value = azurerm_linux_function_app.main.identity[0].principal_id }
output "app_id"          { value = azurerm_linux_function_app.main.id }
