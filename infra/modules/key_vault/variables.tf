variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "suffix" { type = string }
variable "tenant_id" { type = string }
variable "deployer_object_id" { type = string }
variable "wrap_jwt_secret" {
  type      = string
  sensitive = true
}
variable "anthropic_api_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "azure_foundry_endpoint" {
  type    = string
  default = ""
}
variable "azure_foundry_version" {
  type    = string
  default = ""
}
variable "tags" { type = map(string) }
