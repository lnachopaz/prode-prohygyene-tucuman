# Prode Prohygiene Tucumán

Plataforma web de predicción de resultados deportivos desarrollada para los empleados de **Prohygiene S.A.**, Tucumán.

## ¿Qué hace?

Permite a los participantes predecir resultados de partidos de fútbol, acumular puntos y competir en un ranking en tiempo real. Diseñado para fomentar la participación y el compañerismo interno durante torneos.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + TypeScript |
| Backend / Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| UI Builder | Lovable |

## Funcionalidades

- Registro e inicio de sesión por usuario
- Fixture de partidos con fechas y equipos
- Sistema de predicción de resultados por partido
- Puntuación automática al cierre de cada fecha
- Ranking en tiempo real con posiciones actualizadas
- Diseño responsive para uso desde el celular

## Estructura del proyecto

```
prode-prohygyene-tucuman/
├── src/           # Componentes React y lógica principal
├── pages/         # Páginas de la aplicación
├── public/        # Archivos estáticos
├── supabase/      # Migraciones y configuración de base de datos
├── scripts/       # Scripts utilitarios
└── .env.example   # Variables de entorno necesarias
---

Desarrollado por [Luis Ignacio Paz](https://www.linkedin.com/in/luisignaciopaz-ing)
