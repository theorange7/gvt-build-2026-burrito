resource "azurerm_storage_container" "deploy" {
  name                  = "func-deploy"
  storage_account_name  = var.storage_account_name
  container_access_type = "private"
}

resource "azurerm_service_plan" "main" {
  name                = "asp-wrapped-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  # Flex Consumption supports zero-scale and per-function concurrency limits
  os_type  = "Linux"
  sku_name = "FC1"
  tags     = var.tags
}

resource "azurerm_function_app_flex_consumption" "main" {
  name                = "func-wrapped-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.main.id

  # Deployment artifact storage — required by Flex Consumption
  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "https://${var.storage_account_name}.blob.core.windows.net/${azurerm_storage_container.deploy.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = var.storage_account_primary_access_key

  # Runtime
  runtime_name    = "node"
  runtime_version = "22"

  # Scaling
  instance_memory_in_mb  = 2048
  maximum_instance_count = 100

  # Managed identity — used for all Azure SDK calls (Service Bus, Tables, Key Vault)
  identity {
    type = "SystemAssigned"
  }

  site_config {
    cors {
      allowed_origins = split(",", var.allowed_origins)
    }

    # Application Insights
    application_insights_connection_string = var.app_insights_connection_string
    application_insights_key               = var.app_insights_instrumentation_key
  }

  app_settings = {
    # Application Insights
    APPLICATIONINSIGHTS_CONNECTION_STRING = var.app_insights_connection_string

    # Service Bus — Functions binding uses this connection alias
    "ServiceBusConnection__fullyQualifiedNamespace" = var.service_bus_namespace_fqdn
    AZURE_SERVICE_BUS_NAMESPACE                     = var.service_bus_namespace_fqdn
    AZURE_SERVICE_BUS_QUEUE_NAME                    = var.service_bus_queue_name

    # Table Storage
    AZURE_TABLES_ENDPOINT     = var.tables_endpoint
    AZURE_TABLES_JOBS         = var.wrap_tables_jobs
    AZURE_TABLES_RESULTS      = var.wrap_tables_results
    AZURE_TABLES_SHARE_LINKS  = var.wrap_tables_share_links

    # Spec 31 — share bundles in Blob Storage. Optional CDN override.
    AZURE_BLOB_STORAGE_ACCOUNT = var.storage_account_name
    WRAP_SHARE_BASE_URL        = var.wrap_share_base_url

    # Secrets via Key Vault references — Functions resolves @Microsoft.KeyVault(…) at runtime

    # JWT signing — new multi-key scheme (jwt.ts scans WRAP_JWT_KEY_<kid>).
    # WRAP_JWT_SECRET is retained so tokens signed under the legacy shim still
    # verify. Once all outstanding tokens have expired, WRAP_JWT_SECRET can be
    # removed from here and from Key Vault.
    "WRAP_JWT_KEY_v1"    = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/wrap-jwt-key-v1/)"
    WRAP_JWT_ACTIVE_KID  = "v1"
    WRAP_JWT_SECRET      = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/wrap-jwt-secret/)"

    ANTHROPIC_API_KEY              = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/anthropic-api-key/)"
    AZURE_FOUNDRY_PROJECT_ENDPOINT = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/azure-foundry-project-endpoint/)"
    AZURE_FOUNDRY_API_VERSION      = "@Microsoft.KeyVault(SecretUri=${var.key_vault_uri}secrets/azure-foundry-api-version/)"

    # Capacity / tuning
    WRAP_MAX_CONCURRENCY              = tostring(var.wrap_max_concurrency)
    WRAP_PER_INSTALL_LIMIT            = tostring(var.wrap_per_install_limit)
    WRAP_RESULT_TTL_HOURS             = tostring(var.wrap_result_ttl_hours)
    WRAP_REGISTER_RATE_LIMIT_PER_HOUR = tostring(var.wrap_register_rate_limit_per_hour)
    WRAP_MAX_DELIVERIES               = tostring(var.wrap_max_deliveries)

    # Deployment mode — drives whether queue/table clients use connection strings
    # (local) or DefaultAzureCredential (dev/prod). "staging" maps to "dev"
    # because both use managed identity; the distinction only matters locally.
    ENV_MODE = var.env_mode

    # CORS — stored here too so the host.json CORS block can reference it
    WRAP_ALLOWED_ORIGINS = var.allowed_origins
  }

  tags = var.tags
}
