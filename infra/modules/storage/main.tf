resource "random_string" "st_suffix" {
  length  = 4
  special = false
  upper   = false
}

resource "azurerm_storage_account" "main" {
  # Storage account names: 3-24 chars, lowercase alphanumeric only
  name                     = "stwrapped${replace(var.suffix, "-", "")}${random_string.st_suffix.result}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  # Disable shared-key access — Functions connects via managed identity
  shared_access_key_enabled       = true # required by Azure Functions runtime for AzureWebJobsStorage
  allow_nested_items_to_be_public = false

  tags = var.tags
}

resource "azurerm_storage_table" "jobs" {
  name                 = var.jobs_table_name
  storage_account_name = azurerm_storage_account.main.name
}

resource "azurerm_storage_table" "results" {
  name                 = var.results_table_name
  storage_account_name = azurerm_storage_account.main.name
}
