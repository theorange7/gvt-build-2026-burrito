variable "subscription_id" {
  description = "Azure subscription ID to deploy into."
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group that will contain all resources."
  type        = string
  default     = "rg-wrapped-backend"
}

variable "location" {
  description = "Azure region (e.g. eastus2, westeurope)."
  type        = string
  default     = "eastus2"
}

variable "location_short" {
  description = "Short region code used in resource name suffixes (e.g. eus2)."
  type        = string
  default     = "eus2"
}

variable "environment" {
  description = "Deployment environment label (prod, staging, dev)."
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["prod", "staging", "dev"], var.environment)
    error_message = "environment must be prod, staging, or dev."
  }
}

# ── App secrets (supply via tfvars or -var / TF_VAR_* env) ───────────────────

variable "wrap_jwt_secret" {
  description = "HS256 secret used to sign per-install JWT tokens. Min 32 chars."
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key (leave empty string to use Azure Foundry only)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "azure_foundry_project_endpoint" {
  description = "Azure AI Foundry project endpoint URL."
  type        = string
  default     = ""
}

variable "azure_foundry_api_version" {
  description = "Azure AI Foundry / OpenAI API version string."
  type        = string
  default     = ""
}

# ── Capacity / tuning ─────────────────────────────────────────────────────────

variable "wrap_max_concurrency" {
  description = "Global cap on simultaneously running wrap jobs across all installs."
  type        = number
  default     = 8
}

variable "wrap_per_install_limit" {
  description = "Max in-flight wrap jobs per install token."
  type        = number
  default     = 1
}

variable "wrap_result_ttl_hours" {
  description = "Hours a completed result is kept before hard deletion."
  type        = number
  default     = 24
}

variable "wrap_register_rate_limit_per_hour" {
  description = "Max registration requests per IP per hour."
  type        = number
  default     = 10
}

variable "wrap_max_deliveries" {
  description = "Max Service Bus delivery attempts before a wrap job is marked failed. Must match the queue's max_delivery_count."
  type        = number
  default     = 3
}

# ── Azure resource names ──────────────────────────────────────────────────────

variable "wrap_service_bus_queue_name" {
  description = "Name of the Service Bus queue that holds pending wrap jobs."
  type        = string
  default     = "wrap-jobs"
}

variable "wrap_tables_jobs" {
  description = "Azure Table Storage table name for job-status rows."
  type        = string
  default     = "wrapJobs"
}

variable "wrap_tables_results" {
  description = "Azure Table Storage table name for completed result blobs."
  type        = string
  default     = "wrapResults"
}

variable "wrap_allowed_origins" {
  description = "Comma-separated list of CORS origins the Function app permits."
  type        = string
}

variable "foundry_resource_id" {
  description = "The resource ID of our backend Azure AI Foundry resource"
  type        = string
}