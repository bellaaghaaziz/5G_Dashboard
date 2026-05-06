variable "namespace" {
  description = "Kubernetes namespace for CellPilot inference stack."
  type        = string
  default     = "cellpilot-mlops"
}

variable "image" {
  description = "Container image for inference API."
  type        = string
  default     = "5g-handover-ai:latest"
}

variable "replicas" {
  description = "Number of inference replicas."
  type        = number
  default     = 2
}

variable "min_replicas" {
  description = "Minimum pods for autoscaler."
  type        = number
  default     = 2
}

variable "max_replicas" {
  description = "Maximum pods for autoscaler."
  type        = number
  default     = 8
}

variable "target_cpu_utilization_percentage" {
  description = "CPU utilization target for autoscaling."
  type        = number
  default     = 70
}
