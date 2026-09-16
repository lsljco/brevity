# Brevity Product Contract

This file defines architectural decisions that feature work must not silently reverse.

## Today

Today is an executive projection of the seven pillars in this order:

1. Spiritual Maturity
2. Health & Nutrition
3. Physical Fitness
4. Household Management
5. Education
6. Finance
7. Ministry & Fellowship

Today must summarize key items and exceptions. Detailed Household Operations belongs under Household Management.

## Spiritual Maturity

Spiritual Maturity is a shared household devotion. It has household scope and Family ownership at the operating-model level. No generator, normalizer, or UI may force the pillar to be Lorenzo-owned or require Lorenzo to lead another household member's devotion.

## Household Management

Household Management owns Schedule, Routines, Operations, Supplies & Inventory, Family Calendar, Projects, and Estate/property operations. `My Planner` is deprecated and must not be reintroduced as a separate workspace; personal scheduling is represented by Schedule while Family Calendar remains the shared coordination surface.

## Persistence direction

Server-held data is authoritative. Browser storage is a cache/migration bridge only. New domains must not introduce a new browser-only source of truth.

## Operational UX

If Brevity can derive a value from an authoritative source, it should not require the household to re-enter it. Human interaction should primarily be approval, adjustment, decision, completion, and exception handling.

## Regression policy

Every production change must pass unit tests, production build, and browser-level smoke tests at desktop and mobile viewport sizes. Critical navigation, safe-area, authentication/bootstrap, and seven-pillar contracts are release gates.
