# 📖 Manual de Entrenamiento - Sistema ML

**Versión**: 1.0
**Fecha**: Enero 2025

---

## 🎯 Tu Misión

Entrenar al sistema para que genere **renders fotorrealistas perfectos**.

El sistema aprende de tus calificaciones para mejorar automáticamente.

---

## 📋 Proceso Simple (3 pasos)

### 1️⃣ Cargar Imagen

```
┌─────────────────────────┐
│                         │
│   [Haz clic aquí]       │
│   Selecciona imagen     │
│                         │
└─────────────────────────┘
```

- Haz clic en el área de carga
- Selecciona una imagen de diseño interior
- Espera a que aparezca la vista previa
- Haz clic en **"Generar Variantes"**

⏱️ **Tiempo**: ~2-3 minutos para generar

---

### 2️⃣ Comparar Opciones

El sistema te mostrará **2 versiones** de la misma imagen:

```
┌──────────────────┐    ┌──────────────────┐
│   Opción A       │    │   Opción B       │
│                  │    │                  │
│   [Imagen]       │    │   [Imagen]       │
│                  │    │                  │
│   Leonardo       │    │   Stable Diff    │
└──────────────────┘    └──────────────────┘
```

**Mira ambas con atención y pregúntate:**

- ¿Parece una fotografía real?
- ¿Tiene profundidad y dimensión?
- ¿La iluminación es natural?
- ¿Las texturas se ven realistas?
- ¿Los colores son naturales?

---

### 3️⃣ Calificar (Escala 1-5)

Para **CADA opción**, da una calificación:

```
⭐ 1 estrella  = Muy malo (render obvio, plano)
⭐⭐ 2 estrellas = Malo (poco realista)
⭐⭐⭐ 3 estrellas = Regular (algo fotorrealista)
⭐⭐⭐⭐ 4 estrellas = Bueno (casi fotorrealista)
⭐⭐⭐⭐⭐ 5 estrellas = PERFECTO (indistinguible de foto real)
```

#### 💡 Ejemplos de Calificación

**5 Estrellas** ✅
- Parece foto profesional
- Profundidad y dimensión clara
- Iluminación natural
- Texturas ricas y detalladas
- Sombras suaves y realistas

**3 Estrellas** ⚠️
- Se ve como render, pero aceptable
- Algo de profundidad
- Iluminación artificial
- Texturas básicas

**1 Estrella** ❌
- Obviamente render/CGI
- Completamente plano
- Iluminación irreal
- Colores artificiales
- Apariencia de "montaje Photoshop"

---

### 💬 Comentarios (Opcional pero Útil)

Si algo específico no te gusta, escríbelo:

**Buenos comentarios**:
- ✅ "Buena profundidad, pero colores algo apagados"
- ✅ "Iluminación perfecta, texturas excelentes"
- ✅ "Se ve plano, falta profundidad"
- ✅ "Parece montaje de Photoshop"

**Evita**:
- ❌ "No me gusta"
- ❌ "Mal"
- ❌ "Regular"

---

## 📊 Panel de Estado

En la parte superior verás el progreso:

```
┌──────────────────────────────────────────────┐
│ 📈 Estado del Entrenamiento                  │
├──────────────────────────────────────────────┤
│                                              │
│ Muestras: 23/50                              │
│ Mejor Calificación: 3.8/5.0                  │
│ Meta: ≥ 4.0/5.0                              │
│                                              │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 54%                     │
│                                              │
└──────────────────────────────────────────────┘
```

**¿Qué significa?**

- **Muestras**: Cuántas imágenes has calificado (meta: 50)
- **Mejor Calificación**: La calificación más alta alcanzada
- **Meta**: Llegar a 4.0/5.0 o más consistentemente
- **Barra**: Progreso hacia completar Fase 1

---

## ⚡ Meta Diaria

**Objetivo**: 5-10 imágenes por día

```
┌─────────────────────────────────┐
│  5 imágenes × 3 min = 15 minutos │
│ 10 imágenes × 3 min = 30 minutos │
└─────────────────────────────────┘
```

Tiempo total por imagen: ~3 minutos
- 2 min: generar variantes
- 1 min: calificar ambas opciones

---

## 🎓 Consejos para Calificar Bien

### ✅ **SÍ considerar**:

1. **Fotorrealismo**: ¿Parece foto real?
2. **Profundidad**: ¿Tiene dimensión 3D clara?
3. **Iluminación**: ¿Natural y realista?
4. **Texturas**: ¿Detalladas y ricas?
5. **Sombras**: ¿Suaves y naturales?

### ❌ **NO considerar**:

1. Si te gusta el diseño (no es el punto)
2. El estilo de la habitación
3. La decoración específica
4. Tus preferencias personales

**SOLO califica**: ¿Qué tan fotorrealista se ve?

---

## 🔄 ¿Qué Pasa con tus Calificaciones?

```
Tu Calificación
     ↓
Sistema ML Aprende
     ↓
Mejora Automáticamente
     ↓
Próximas imágenes son mejores
     ↓
Eventualmente: Fotorrealismo Perfecto ✨
```

**Cada 10 muestras**, el sistema:
1. Analiza qué está funcionando
2. Evoluciona los prompts automáticamente
3. Prueba nuevos parámetros
4. Mejora continuamente

---

## ❓ Preguntas Frecuentes

### ¿Cuánto tiempo toma entrenar el sistema?

**Fase 1**: 50 muestras (1-2 semanas a 5-10/día)
**Resultado**: Sistema produce renders aceptables (≥4.0/5.0)

**Fase 2**: Continúa aprendiendo indefinidamente
**Resultado**: Mejora continua hacia perfección (≥4.5/5.0)

### ¿Qué pasa si me equivoco en una calificación?

No hay problema. El sistema usa muchas muestras, así que un error ocasional no afecta.

### ¿Puedo saltar imágenes?

Sí, si una imagen no carga o hay error técnico, simplemente carga otra.

### ¿Debo calificar siempre ambas opciones?

Sí, ambas opciones son importantes. El sistema aprende cuál API (Leonardo o Stable Diffusion) funciona mejor.

### ¿Qué hago si ambas opciones son malas?

Califícalas honestamente (1-2 estrellas). El sistema aprende de esto también.

### ¿Qué hago si ambas opciones son excelentes?

¡Perfecto! Da 5 estrellas a ambas. Eso significa que el sistema está aprendiendo bien.

---

## 🚨 Problemas Comunes

### "No se generan las variantes"

1. Verifica tu conexión a internet
2. Espera 2-3 minutos completos
3. Si persiste, recarga la página e intenta de nuevo

### "Las imágenes se ven borrosas"

1. Haz clic en la imagen para ver en tamaño completo
2. Usa las herramientas de zoom del navegador (Cmd/Ctrl + +)

### "No puedo calificar"

1. Asegúrate de haber dado estrellas a AMBAS opciones
2. El botón "Enviar" solo se activa cuando ambas están calificadas

### "Olvidé agregar comentarios"

Los comentarios son opcionales. Puedes enviar sin comentarios.

---

## 📞 Contacto

Si tienes problemas técnicos o dudas:

- **Email**: [tu-email@example.com]
- **Slack**: #ml-training

---

## 🎯 Resumen Rápido

1. **Carga imagen** → Haz clic, selecciona, genera
2. **Compara opciones** → Mira ambas con atención
3. **Califica 1-5 estrellas** → ¿Qué tan fotorrealista?
4. **Comenta (opcional)** → ¿Qué específicamente?
5. **Envía** → ¡Listo!

**Meta**: 5-10 imágenes por día
**Tiempo**: ~3 minutos por imagen
**Objetivo**: Llegar a 50 muestras con calificación ≥4.0

---

**¡Gracias por entrenar el sistema! 🙌**

Tu trabajo hace posible que el sistema genere renders fotorrealistas perfectos automáticamente.
