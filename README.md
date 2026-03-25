
# 🛠️ ReparaSuite: Enterprise Service Management Ecosystem

ReparaSuite es una solución SaaS de alto rendimiento diseñada para la gestión integral del ciclo de vida de servicios técnicos. A diferencia de sistemas simples, este ecosistema utiliza una arquitectura de **Backend Único y Frontend Multicliente**, optimizando la experiencia operativa para técnicos y la experiencia de usuario para clientes finales.

---

## 🏗️ Arquitectura de Software

El sistema implementa un modelo de comunicación desacoplado:

* **Core Engine (API):** `Spring Boot 3` + `Java 17` con persistencia en `PostgreSQL`.
* **Admin Dashboard:** Aplicación de alta densidad construida en `Angular 19` + `Material Design`.
* **Customer Portal:** `PWA` (Progressive Web App) ligera para seguimiento en tiempo real.

```mermaid
graph LR
    subgraph Clients
        P[Portal Cliente PWA]
    end
    subgraph Management
        B[Backoffice Administrativo]
    end
    subgraph Cloud_Infrastructure
        S[Spring Boot API REST]
        D[(PostgreSQL 16)]
        G[Gemini AI Engine]
    end

    P -->|HTTPS/JWT| S
    B -->|HTTPS/JWT| S
    S <--> D
    S <--> G

🚀 Tecnologías y Stack Profesional
Backend: Java 17, Spring Boot 3, Spring Security (JWT), Hibernate/JPA.

Frontend: Angular 19, RxJS (Gestión de estados), Angular Material, Service Workers (PWA).

DevOps & Infra: Docker, Docker Compose, Nginx, GitHub Submodules.

IA: Integración con Google Gemini Pro para análisis de datos no estructurados.

📦 Gestión de Infraestructura
El proyecto utiliza un enfoque de Infraestructura como Código (IaC) mediante Docker, permitiendo un despliegue idéntico en desarrollo, testing y producción.

Bash
# Clonar el ecosistema completo (incluyendo submódulos)
git clone --recurse-submodules [https://github.com/GledysP/reparasuite-root.git](https://github.com/GledysP/reparasuite-root.git)

# Despliegue de servicios (DB + API + 2 Frontends)
docker-compose up --build -d

🧠 Capa de Innovación: Gemini AI
ReparaSuite no es solo un CRUD; integra Inteligencia Artificial para optimizar la eficiencia operativa:

Análisis Predictivo: Sugerencia de fallos comunes basada en la descripción inicial del ticket.

Smart-Bridging: Automatización del paso de "Ticket de Cliente" a "Orden Técnica", normalizando el lenguaje coloquial a términos técnicos.

🔄 Flujo Operativo Asistido por IA
Fragmento de código
sequenceDiagram
    participant C as Cliente (Portal PWA)
    participant AI as Gemini AI Engine
    participant T as Técnico (Backoffice)
    
    C->>C: Crea Ticket (Lenguaje coloquial)
    C->>AI: Analiza descripción y fotos
    AI-->>C: Sugiere categoría y prioridad
    C->>T: Envía Ticket validado
    T->>AI: Genera borrador de Orden de Trabajo
    AI-->>T: Sugiere checklist técnico y repuestos
    T->>T: Ejecuta reparación y cierra OT