provider "kubernetes" {
  config_path = "~/.kube/config"
}

resource "kubernetes_namespace" "cellpilot" {
  metadata {
    name = var.namespace
  }
}

resource "kubernetes_config_map" "inference_config" {
  metadata {
    name      = "cellpilot-inference-config"
    namespace = kubernetes_namespace.cellpilot.metadata[0].name
  }

  data = {
    PYTHONUNBUFFERED = "1"
    LOG_LEVEL        = "INFO"
  }
}

resource "kubernetes_deployment" "inference" {
  metadata {
    name      = "cellpilot-inference"
    namespace = kubernetes_namespace.cellpilot.metadata[0].name
    labels = {
      app = "cellpilot-inference"
    }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "cellpilot-inference"
      }
    }

    template {
      metadata {
        labels = {
          app = "cellpilot-inference"
        }
      }

      spec {
        container {
          name              = "inference-api"
          image             = var.image
          image_pull_policy = "IfNotPresent"
          command           = ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]

          port {
            container_port = 8000
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.inference_config.metadata[0].name
            }
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "512Mi"
            }
            limits = {
              cpu    = "1"
              memory = "2Gi"
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8000
            }
            initial_delay_seconds = 20
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8000
            }
            initial_delay_seconds = 10
            period_seconds        = 10
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "inference" {
  metadata {
    name      = "cellpilot-inference"
    namespace = kubernetes_namespace.cellpilot.metadata[0].name
    labels = {
      app = "cellpilot-inference"
    }
  }

  spec {
    selector = {
      app = "cellpilot-inference"
    }

    port {
      port        = 80
      target_port = 8000
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

resource "kubernetes_horizontal_pod_autoscaler_v2" "inference" {
  metadata {
    name      = "cellpilot-inference-hpa"
    namespace = kubernetes_namespace.cellpilot.metadata[0].name
  }

  spec {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.inference.metadata[0].name
    }

    metric {
      type = "Resource"

      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = var.target_cpu_utilization_percentage
        }
      }
    }
  }
}
