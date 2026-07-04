variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "suffix" { type = string }
variable "jobs_table_name" { type = string }
variable "results_table_name" { type = string }
variable "share_links_table_name" {
  type    = string
  default = "shareLinks"
}
variable "tags" { type = map(string) }
