# Sistema de Prompts - ML Learning

Este directorio contiene las versiones de prompts utilizadas por el sistema de aprendizaje automático.

## Estructura

```
/prompts/
├── schema.json                 # Esquema JSON de versiones de prompts
├── evolution-system-prompt.txt # Prompt del sistema para GPT-4
├── versions/                   # Versiones de prompts
│   ├── v1.0.0.json            # Versión baseline (actual de producción)
│   ├── v1.0.1.json            # Primera evolución (ejemplo)
│   └── current.json → v1.0.0.json  # Symlink a versión activa
└── experiments/                # Experimentos específicos
    └── experiment_001.json
```

## Formato de Versión

Las versiones siguen [Semantic Versioning](https://semver.org/):
- **v1.0.0**: Versión baseline
- **v1.1.0**: Cambio menor (ajuste de parámetros)
- **v2.0.0**: Cambio mayor (reescritura de prompt)

## Uso

### Cargar versión actual
```typescript
import { loadCurrentPromptVersion } from '@/lib/prompt-loader';

const currentPrompt = await loadCurrentPromptVersion();
```

### Cargar versión específica
```typescript
import { loadPromptVersion } from '@/lib/prompt-loader';

const prompt = await loadPromptVersion('v1.0.0');
```

### Crear nueva versión
```typescript
import { savePromptVersion } from '@/lib/prompt-loader';

await savePromptVersion({
  version: 'v1.1.0',
  parent_version: 'v1.0.0',
  // ... resto de la configuración
});
```

## Evolución de Prompts

El sistema de evolución automática:
1. Se activa cada 10 muestras de entrenamiento
2. Analiza las calificaciones recientes
3. Usa GPT-4 para generar prompts mejorados
4. Crea una nueva versión
5. Realiza pruebas A/B
6. Promueve el ganador a `current.json`

## Performance Tracking

Cada versión registra:
- **avg_rating**: Calificación promedio (1-5)
- **sample_count**: Número de muestras probadas
- **win_rate**: Tasa de victoria en pruebas A/B
- **last_used**: Última vez que se usó

## Notas

- **NO editar manualmente** las versiones en producción
- **Siempre crear nueva versión** para cambios
- **Documentar cambios** en `metadata.changes`
- El symlink `current.json` es actualizado automáticamente por el sistema
