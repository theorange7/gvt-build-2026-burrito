terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state — swap for local backend during first-time setup
  /* backend "azurerm" {
    resource_group_name  = "rg-wrapped-tfstate"
    storage_account_name = "stwrappedtfstate"
    container_name       = "tfstate"
    key                  = "wrapped-backend.tfstate"
  } */
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
  subscription_id = var.subscription_id
}

provider "azuread" {}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.common_tags
}

locals {
  # Shared suffix keeps names unique across environments
  suffix = "${var.environment}-${var.location_short}"

  common_tags = {
    project     = "burrito"
    team        = "Fancy Burritos"
    purpose     = "Build 2026 - Timothy"
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ── Monitoring ──────────────────────────────────────────────────────────────

module "monitoring" {
  source = "./modules/monitoring"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  suffix              = local.suffix
  tags                = local.common_tags
}

# ── Storage (Tables for job rows + results) ──────────────────────────────────

module "storage" {
  source = "./modules/storage"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  suffix              = local.suffix
  jobs_table_name     = var.wrap_tables_jobs
  results_table_name  = var.wrap_tables_results
  tags                = local.common_tags
}

# ── Service Bus ──────────────────────────────────────────────────────────────

module "service_bus" {
  source = "./modules/service_bus"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  suffix              = local.suffix
  queue_name          = var.wrap_service_bus_queue_name
  tags                = local.common_tags
}

# ── Key Vault ────────────────────────────────────────────────────────────────

module "key_vault" {
  source = "./modules/key_vault"

  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  suffix                 = local.suffix
  tenant_id              = data.azurerm_client_config.current.tenant_id
  deployer_object_id     = data.azurerm_client_config.current.object_id
  wrap_jwt_secret        = var.wrap_jwt_secret
  anthropic_api_key      = var.anthropic_api_key
  azure_foundry_endpoint = var.azure_foundry_project_endpoint
  azure_foundry_version  = var.azure_foundry_api_version
  tags                   = local.common_tags
}

# ── Functions App ─────────────────────────────────────────────────────────────

module "functions" {
  source = "./modules/functions"

  resource_group_name                = azurerm_resource_group.main.name
  location                           = azurerm_resource_group.main.location
  suffix                             = local.suffix
  app_insights_connection_string     = module.monitoring.connection_string
  app_insights_instrumentation_key   = module.monitoring.instrumentation_key
  storage_account_name               = module.storage.account_name
  storage_account_primary_access_key = module.storage.primary_access_key
  service_bus_namespace_fqdn         = module.service_bus.namespace_fqdn
  service_bus_queue_name             = var.wrap_service_bus_queue_name
  tables_endpoint                    = module.storage.tables_endpoint
  key_vault_uri                      = module.key_vault.vault_uri
  wrap_max_concurrency               = var.wrap_max_concurrency
  wrap_per_install_limit             = var.wrap_per_install_limit
  wrap_result_ttl_hours              = var.wrap_result_ttl_hours
  wrap_register_rate_limit_per_hour  = var.wrap_register_rate_limit_per_hour
  wrap_tables_jobs                   = var.wrap_tables_jobs
  wrap_tables_results                = var.wrap_tables_results
  allowed_origins                    = var.wrap_allowed_origins
  tags                               = local.common_tags
}

# ── RBAC: Functions managed identity → Service Bus ───────────────────────────

resource "azurerm_role_assignment" "func_sb_sender" {
  scope                = module.service_bus.namespace_id
  role_definition_name = "Azure Service Bus Data Sender"
  principal_id         = module.functions.principal_id
}

resource "azurerm_role_assignment" "func_sb_receiver" {
  scope                = module.service_bus.namespace_id
  role_definition_name = "Azure Service Bus Data Receiver"
  principal_id         = module.functions.principal_id
}

# ── RBAC: Functions managed identity → Storage Tables ────────────────────────

resource "azurerm_role_assignment" "func_table_contributor" {
  scope                = module.storage.account_id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = module.functions.principal_id
}

# ── RBAC: Functions managed identity → Key Vault ─────────────────────────────

resource "azurerm_key_vault_access_policy" "func_read" {
  key_vault_id = module.key_vault.vault_id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = module.functions.principal_id

  secret_permissions = ["Get", "List"]
}
