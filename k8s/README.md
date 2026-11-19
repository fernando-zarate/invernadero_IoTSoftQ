# Kubernetes Deployment Guide (Minikube)

Manifests for deploying **Invernadero IoT** (PostgreSQL 16, NestJS API, and Next.js Dashboard) into the dedicated `invernadero` namespace on a local Minikube cluster.

## Prerequisites

- Docker
- `kubectl`
- `minikube`

## 1. Build Local Docker Images

Run from the **repository root**:

```bash
docker build -f docker/nestjs.Dockerfile -t invernadero-backend:1.0 .
docker build -f docker/nextjs.Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  -t invernadero-frontend:1.0 .
```

## 2. Start Minikube & Enable Addons

```bash
minikube start
minikube addons enable ingress
# Optional (required for upcoming HPA configuration):
minikube addons enable metrics-server
```

## 3. Load Local Images into Minikube

```bash
minikube image load invernadero-backend:1.0
minikube image load invernadero-frontend:1.0
minikube image load postgres:16-alpine
```

## 4. Apply Manifests

```bash
kubectl apply -f k8s/
```

Wait for rollouts to complete:

```bash
kubectl -n invernadero rollout status statefulset/postgres
kubectl -n invernadero rollout status deployment/backend
kubectl -n invernadero rollout status deployment/frontend
```

## 5. Verify & Access

```bash
MINIKUBE_IP=$(minikube ip)

# Health checks
curl -fsS "http://${MINIKUBE_IP}/api/health"
curl -fsS "http://${MINIKUBE_IP}/api/health/ready"

# Seeded telemetry endpoint
curl -fsS "http://${MINIKUBE_IP}/api/metrics/ESP32-INV-01/latest?sensorType=temp,airHum"

# Open dashboard in browser:
echo "Dashboard: http://${MINIKUBE_IP}/dashboard"
echo "Swagger:   http://${MINIKUBE_IP}/api/api-docs/"
```

## Tear Down

```bash
kubectl delete -f k8s/
```
