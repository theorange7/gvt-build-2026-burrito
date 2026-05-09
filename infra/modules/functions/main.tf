resource "azurerm_service_plan" "main" {
  name                = "asp-wrapped-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  # Flex Consumption supports zero-scale and per-function concurrency limits
  os_type  = "Linux"
  sku_name = "FC1"
  tags     = var.tags
}

resource "azurerm_linux_function_app" "main" {
  name                = "func-wrapped-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id

  # Flex Consumption requires a storage account for internal use
  storage_account_name       = var.storage_account_name
  storage_account_access_key = var.storage_account_primary_access_key

  # Managed identity — used for all Azure SDK calls (Service Bus, Tables, Key Vault)
  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "22"
    }

    cors {
      allowed_origins = split(",", var.allowed_origins)
    }

    # Application Insights
    application_insights_connection_string = var.app_insights_connection_string
    application_insights_key               = var.app_insights_instrumentation_key
  }

  app_settings = {
    # Runtime
    FUNCTIONS_WORKER_RUNTIME = "node"
    WEBSITE_RUN_FROM_PACKAGE = "1"

    # Application Insights
    APPLICATIONINSIGHTS_CONNECTION_STRING = var.app_insights_connection_string

    # Service Bus — Functions binding uses this connection alias
    "ServiceBusConnection__fullyQualifiedNamespace" = var.service_bus_namespace_fqdn
    AZURE_SERVICE_BUS_NAMESPACE                     = var.service_bus_namespace_fqdn
    AZURE_SERVICE_BUS_QUEUE_NAME                    = var.service_bus_queue_name

    # Table Storage
    AZURE_TABLES_ENDPOINT = var.tables_endpoint
    AZURE_TABLES_JOBS     = var.wrap_tables_jobs
    AZURE_TABLES_RESULTS  = var.wrap_tables_results

    # Secrets via Key Vault references — Functions resolves @Microsoft.KeyVault(…) at runtime
    WRAP_JWT_SECRET              = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/wrap-jwt-secret/)"
    ANTHROPIC_API_KEY            = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/anthropic-api-key/)"
    AZURE_FOUNDRY_PROJECT_ENDPOINT = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/azure-foundry-project-endpoint/)"
    AZURE_FOUNDRY_API_VERSION    = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/azure-foundry-api-version/)"

    # Capacity / tuning
    WRAP_MAX_CONCURRENCY              = tostring(var.wrap_max_concurrency)
    WRAP_PER_INSTALL_LIMIT            = tostring(var.wrap_per_install_limit)
    WRAP_RESULT_TTL_HOURS             = tostring(var.wrap_result_ttl_hours)
    WRAP_REGISTER_RATE_LIMIT_PER_HOUR = tostring(var.wrap_register_rate_limit_per_hour)

    # CORS — stored here too so the host.json CORS block can reference it
    WRAP_ALLOWED_ORIGINS = var.allowed_origins
  }

  tags = var.tags
}
