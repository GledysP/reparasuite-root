# 🗺️ Vision & Product Roadmap 2026

Este roadmap detalla la evolución de ReparaSuite desde un MVP funcional hacia una plataforma de gestión de activos (EAM) completa.

## Fase 1: Consolidación Operativa (Finalizada Q1)
* Arquitectura base Monorepo y gestión de submódulos.
* Implementación de seguridad perimetral con JWT.
* Flujo transaccional: Ticket (Cliente) ↔ Orden de Trabajo (Técnico).

## Fase 2: Integración de Recursos e Inventario (Próximamente)
* **Módulo de Suministros:** Vinculación directa de repuestos del inventario a las OTs.
* **Control de Stock:** Descuento automático de existencias tras cierre de reparaciones.
* **Gestión de Costos:** Cálculo en tiempo real de márgenes de beneficio por orden.

## Fase 3: Expansión de Verticales (Mantenimiento e Instalación)
* **Módulo de Mantenimiento Preventivo:** Programación de citas recurrentes para revisión de equipos.
* **Gestión de Instalaciones:** Flujo especializado para puesta en marcha de equipos nuevos.
* **Checklist de Calidad:** Formularios dinámicos para cumplimiento de normativas técnicas.

## Fase 4: Inteligencia Artificial Avanzada (Gemini AI)
* **Asistente de Diagnóstico:** IA analizando fotos y descripciones para sugerir checklists de reparación.
* **Optimización de Rutas:** Sugerencia de técnicos según ubicación y especialidad.

## Fase 5: Modelo SaaS Enterprise (Multi-tenant)
* Soporte para múltiples talleres con aislamiento total de datos (PostgreSQL Row Level Security).
* Dashboard de analítica avanzada para dueños de franquicias.