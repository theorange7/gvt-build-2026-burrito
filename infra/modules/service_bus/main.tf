resource "azurerm_servicebus_namespace" "main" {
  name                = "sbns-wrapped-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "Standard"
  tags                = var.tags
}

resource "azurerm_servicebus_queue" "wrap_jobs" {
  name         = var.queue_name
  namespace_id = azurerm_servicebus_namespace.main.id

  # Keep unprocessed messages for up to 1 day, then dead-letter them
  max_delivery_count                   = 3
  default_message_ttl         = "P1D"
  dead_lettering_on_message_expiration = true

  # Lock messages for up to 5 minutes while the worker processes them
  lock_duration = "PT5M"
}
