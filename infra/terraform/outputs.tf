output "namespace" {
  description = "Deployed namespace."
  value       = kubernetes_namespace.cellpilot.metadata[0].name
}

output "inference_service_name" {
  description = "Kubernetes service name for inference."
  value       = kubernetes_service.inference.metadata[0].name
}
