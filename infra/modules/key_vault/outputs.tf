output "vault_id" { value = azurerm_key_vault.main.id }
output "vault_uri" { value = azurerm_key_vault.main.vault_uri }

output "wrap_jwt_secret_id" {
  value = azurerm_key_vault_secret.wrap_jwt_secret.id
}

output "wrap_jwt_key_v1_id" {
  value = azurerm_key_vault_secret.wrap_jwt_key_v1.id
}

output "anthropic_api_key_id" {
  value = length(azurerm_key_vault_secret.anthropic_api_key) > 0 ? azurerm_key_vault_secret.anthropic_api_key[0].id : null
}
