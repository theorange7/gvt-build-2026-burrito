resource "azurerm_key_vault" "main" {
  name                = "kv-wrapped-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = var.tenant_id
  sku_name            = "standard"

  # Soft-delete is mandatory in Azure — 7 days is the minimum
  soft_delete_retention_days = 7
  purge_protection_enabled   = false # allow destroy in dev; set true for prod

  tags = var.tags
}

# Give the deploying principal access so it can write secrets via Terraform
resource "azurerm_key_vault_access_policy" "deployer" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = var.tenant_id
  object_id    = var.deployer_object_id

  secret_permissions = ["Get", "List", "Set", "Delete", "Recover", "Backup", "Restore", "Purge"]
}

resource "azurerm_key_vault_secret" "wrap_jwt_secret" {
  name         = "wrap-jwt-secret"
  value        = var.wrap_jwt_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "anthropic_api_key" {
  count        = var.anthropic_api_key != "" ? 1 : 0
  name         = "anthropic-api-key"
  value        = var.anthropic_api_key
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "azure_foundry_endpoint" {
  count        = var.azure_foundry_endpoint != "" ? 1 : 0
  name         = "azure-foundry-project-endpoint"
  value        = var.azure_foundry_endpoint
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}

resource "azurerm_key_vault_secret" "azure_foundry_version" {
  count        = var.azure_foundry_version != "" ? 1 : 0
  name         = "azure-foundry-api-version"
  value        = var.azure_foundry_version
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_key_vault_access_policy.deployer]
}
