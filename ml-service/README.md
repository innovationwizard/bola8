# ML Service - Bayesian Optimization

Servicio de Python con FastAPI que implementa optimización bayesiana para los parámetros de mejora de imágenes.

## Desarrollo Local

### Requisitos
- Python 3.11+
- pip

### Instalación

```bash
cd ml-service
python3 -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Ejecutar

```bash
python main.py
```

El servicio estará disponible en `http://localhost:8000`

### Probar

```bash
# Health check
curl http://localhost:8000/health

# Obtener sugerencias
curl -X POST http://localhost:8000/ml/suggest_parameters \
  -H "Content-Type: application/json" \
  -d '{"mode": "structure", "num_suggestions": 2}'

# Actualizar modelo
curl -X POST http://localhost:8000/ml/update_model \
  -H "Content-Type: application/json" \
  -d '{
    "results": [
      {
        "parameters": {
          "api": "leonardo",
          "init_strength": 0.28,
          "guidance_scale": 7.2,
          "controlnet_weight": 0.89
        },
        "rating": 4.0
      }
    ]
  }'
```

## Docker

### Construir imagen

```bash
docker build -t bola8-ml-service .
```

### Ejecutar con Docker

```bash
docker run -p 8000:8000 bola8-ml-service
```

### Usar Docker Compose

```bash
docker-compose up -d
```

## Desplegar a AWS ECS Fargate

Ver [DEPLOYMENT.md](../docs/DEPLOYMENT.md) para instrucciones completas de despliegue.

### Pasos resumidos:

1. **Construir y subir imagen a ECR**:
   ```bash
   aws ecr create-repository --repository-name bola8-ml-service
   docker tag bola8-ml-service:latest <account-id>.dkr.ecr.<region>.amazonaws.com/bola8-ml-service:latest
   aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/bola8-ml-service:latest
   ```

2. **Crear Task Definition en ECS**

3. **Crear Service en Fargate**

4. **Configurar Load Balancer (opcional)**

5. **Agregar URL a variables de entorno**:
   ```bash
   ML_SERVICE_URL=http://<alb-dns>
   ```

## API Endpoints

### `GET /health`
Health check del servicio.

**Respuesta**:
```json
{
  "status": "healthy",
  "service": "ml-service",
  "version": "1.0.0",
  "optimizer_samples": 23
}
```

### `POST /ml/suggest_parameters`
Obtiene sugerencias de parámetros optimizados por Bayesian.

**Request**:
```json
{
  "mode": "structure",
  "num_suggestions": 2
}
```

**Response**:
```json
{
  "suggestions": [
    {
      "api": "leonardo",
      "init_strength": 0.28,
      "guidance_scale": 7.2,
      "controlnet_weight": 0.89
    },
    {
      "api": "stablediffusion",
      "strength": 0.22,
      "guidance_scale": 8.1,
      "controlnet_conditioning_scale": 0.93
    }
  ]
}
```

### `POST /ml/update_model`
Actualiza el optimizador con nuevas calificaciones.

**Request**:
```json
{
  "results": [
    {
      "parameters": {
        "api": "leonardo",
        "init_strength": 0.28,
        "guidance_scale": 7.2,
        "controlnet_weight": 0.89
      },
      "rating": 4.0
    }
  ]
}
```

**Response**:
```json
{
  "updated": true,
  "samples_seen": 24,
  "convergence_score": 0.48
}
```

### `GET /ml/stats`
Obtiene estadísticas del optimizador.

**Response**:
```json
{
  "samples_seen": 24,
  "convergence": 0.48,
  "best_parameters": {
    "api": "stablediffusion",
    "strength": 0.22,
    "guidance_scale": 8.1,
    "controlnet_conditioning_scale": 0.93
  },
  "best_rating": 4.5
}
```

## Arquitectura

El servicio utiliza:
- **FastAPI**: Framework web rápido y moderno
- **scikit-optimize**: Implementación de optimización bayesiana
- **Gaussian Process**: Modelo probabilístico para predecir rating vs parámetros
- **Expected Improvement**: Función de adquisición para balancear exploración/explotación

## Logging

Los logs se escriben a stdout en formato JSON:

```json
{
  "timestamp": "2025-01-19T10:00:00Z",
  "level": "INFO",
  "message": "Generated 2 suggestions"
}
```

## Troubleshooting

### Servicio no responde
1. Verificar que el contenedor está corriendo: `docker ps`
2. Ver logs: `docker logs <container-id>`
3. Probar health check: `curl http://localhost:8000/health`

### Sugerencias siempre iguales
- El optimizador necesita al menos 5 muestras para empezar a aprender
- Primeras sugerencias son aleatorias (exploración inicial)

### Convergencia muy lenta
- Aumentar `n_initial_points` en `optimizer.py`
- Verificar que las calificaciones sean consistentes
- Considerar expandir el espacio de parámetros

## Desarrollo

### Tests (TODO)
```bash
pytest tests/
```

### Linting
```bash
black .
flake8 .
```

## Licencia

Propietario - Bola8
