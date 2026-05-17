variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "suffix" { type = string }
variable "queue_name" { type = string }
variable "max_delivery_count" { type = number }
variable "tags" { type = map(string) }
