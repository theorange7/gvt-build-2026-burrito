output "namespace_id" { value = azurerm_servicebus_namespace.main.id }
output "namespace_fqdn" { value = "${azurerm_servicebus_namespace.main.name}.servicebus.windows.net" }
output "queue_name" { value = azurerm_servicebus_queue.wrap_jobs.name }
