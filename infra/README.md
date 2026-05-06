# Infrastructure Guide

This folder contains production infrastructure definitions for the CellPilot inference stack.

## Kubernetes manifests

Apply baseline stack:

```bash
make k8s-apply
```

Delete stack:

```bash
make k8s-delete
```

Manifests include:

- Inference namespace, config map, deployment, service, HPA
- Prometheus deployment/service + scrape config for `/metrics/prometheus`
- Grafana deployment/service

## Terraform

Validate configuration:

```bash
make tf-validate
```

Plan changes:

```bash
make tf-plan
```

Apply:

```bash
make tf-apply
```

Destroy:

```bash
make tf-destroy
```

Override variables with `-var`, for example:

```bash
terraform -chdir=infra/terraform plan -var "image=myrepo/5g-handover-ai:latest"
```
