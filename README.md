# AI SaaS (Bots + Multi-tenant + Evaluator)

Plataforma Next.js para administrar bots de simulacion/evaluacion con:

- acceso por organizaciones,
- sesiones y conversaciones persistidas,
- control de flujo por configuracion,
- RAG opcional,
- evaluacion automatica.

## Requisitos

- Node.js 20+
- PostgreSQL (Supabase recomendado)

## Instalacion

```bash
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
```

## Variables de entorno

### Minimas obligatorias

```bash
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://... # opcional, recomendado para migraciones
APP_JWT_SECRET=...
ENCRYPTION_KEY=...          # secreto fuerte para cifrado de API keys
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Seguridad y operacion (recomendadas)

```bash
# Rate limit
RATE_LIMIT_BACKEND=upstash         # prod recomendado: upstash
RATE_LIMIT_FAIL_CLOSED=true        # prod estricto: bloquea si Upstash falla
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

CHAT_RATE_LIMIT_MAX=60
CHAT_RATE_LIMIT_WINDOW_MS=60000
SESSION_RATE_LIMIT_MAX=30
SESSION_RATE_LIMIT_WINDOW_MS=60000

# Cifrado legacy (solo migracion temporal)
ENCRYPTION_MIGRATION_LEGACY_SECRET=

# CSP / CSRF
CSP_REPORT_ONLY=false
CSP_NONCE_ENABLED=true             # prod recomendado: true (default prod)
CSP_ALLOW_UNSAFE_INLINE_SCRIPT=false
CSRF_TRUSTED_ORIGINS=https://admin.tu-dominio.com,https://app.tu-dominio.com

# Retencion de logs de evaluacion (admin debug)
EVALUATION_RAW_LOG_RETENTION_DAYS=30

# Resiliencia de regex/triggers
FLOW_MAX_REGEX_TRIGGERS=120         # lint/publish: maximo de triggers REGEX por bot
FLOW_RUNTIME_MAX_REGEX_EVALS=120    # runtime: presupuesto maximo de evaluaciones REGEX por turno

# Seed
SEED_ADMIN_PASSWORD=
```

Notas:

- `ENCRYPTION_MIGRATION_LEGACY_SECRET` solo se usa para leer payloads legacy CBC y migrarlos al volver a guardar. No dejarlo permanente si no hace falta.
- No existe fallback global de API key: cada integracion usa su propia key (bot, TTS, QA Lab). Si falta, falla.

## Seguridad

### 1) Autorizacion tipada (401/403)

- `verifyAdmin()` y helpers en `src/lib/auth-utils.ts` lanzan `AuthorizationError` con `status` y `code` tipados.
- Los endpoints API admin manejan ese error y responden 401/403 consistente en JSON.
- `src/proxy.ts` diferencia respuestas para web y `/api/*`.

### 2) Cifrado de API keys (AES-256-GCM)

- `src/lib/crypto.ts` usa AES-256-GCM (`enc:v2:...`) con autenticacion.
- `encrypt()` corta con error si recibe valor vacio o no hay `ENCRYPTION_KEY`.
- No hay fallback inseguro por defecto.
- Compatibilidad legacy CBC existe solo para descifrado de migracion controlada.

### 3) Anti-fuga en respuestas publicas

- `getPublicBot()` retorna contrato allowlist via `toPublicBotResponse()`.
- Respuestas de chat/sesiones usan contratos publicos (`toPublicChatResponse`, `toPublicEndedChatResponse`, `toPublicSessionResponse`).
- Guardrails en tests para evitar leaks de `api_key` o campos sensibles.

### 4) Rate limiting configurable

- Backend configurable por `RATE_LIMIT_BACKEND`: `local`, `upstash`, `auto`.
- En serverless, usar `upstash` para enforcement distribuido real.
- `RATE_LIMIT_FAIL_CLOSED=true` en prod para modo estricto.

### 5) CSP

- `src/proxy.ts` aplica `Content-Security-Policy` por request usando nonce (`x-nonce`).
- Si `CSP_REPORT_ONLY=true`, usa `Content-Security-Policy-Report-Only`.
- `CSP_NONCE_ENABLED` default:
  - `true` en produccion.
  - `false` fuera de produccion.
- Si nonce esta desactivado (`CSP_NONCE_ENABLED=false`), `script-src` vuelve al modo de compatibilidad con `CSP_ALLOW_UNSAFE_INLINE_SCRIPT`.
- En desarrollo se habilitan excepciones de compatibilidad (ej: `unsafe-eval` para tooling dev).

### 6) CSRF / Origin checks

- `src/proxy.ts` valida `Origin/Referer` en metodos inseguros (`POST/PUT/PATCH/DELETE`).
- En produccion, requests sin origen valido se bloquean.
- Se permiten excepciones explicitas para rutas tecnicas puntuales (`/api/auth/lti/*`, `/api/admin/qa-runs/worker`).

### 7) Auditoria de revelado de secrets

- Revelar API keys admin registra evento en `audit_key_access` (modelo `ApiKeyAccessAudit`).
- Se guarda: recurso, admin, IP, user-agent y timestamp.
- Respuesta de revelado siempre `Cache-Control: no-store`.

### 8) Retencion y auditoria de logs de evaluacion

- `evaluation.raw_log` se oculta automaticamente cuando supera la retencion configurada.
- Cada apertura del modal "Raw Evaluation Log" queda auditada en metadata (`evaluation_log_access_audit`).
- Script de limpieza fisica de logs vencidos:

```bash
DRY_RUN=true npm run logs:cleanup:evaluation
npm run logs:cleanup:evaluation
```

### 9) Límite operativo de triggers REGEX

- Lint/publish bloquea bots que exceden `FLOW_MAX_REGEX_TRIGGERS` (`REGEX_TRIGGER_LIMIT_EXCEEDED`).
- Runtime aplica presupuesto por turno (`FLOW_RUNTIME_MAX_REGEX_EVALS`) para evitar sobrecarga por configs legacy o no publicadas.

Recomendacion Supabase para `public.audit_key_access` (si aun no lo aplicaste):

```sql
ALTER TABLE public.audit_key_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_key_access FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audit_key_access FROM public;
REVOKE ALL ON TABLE public.audit_key_access FROM anon;
REVOKE ALL ON TABLE public.audit_key_access FROM authenticated;

GRANT ALL ON TABLE public.audit_key_access TO service_role;
GRANT ALL ON TABLE public.audit_key_access TO postgres;

DROP POLICY IF EXISTS "no_public_access" ON public.audit_key_access;
CREATE POLICY "no_public_access"
ON public.audit_key_access
FOR ALL
USING (false)
WITH CHECK (false);
```

## Endpoints admin de API key

Los siguientes endpoints son `admin-only`, revalidan permisos y responden con `no-store`:

- `GET /api/admin/bots/[id]/api-key`
- `GET /api/admin/tts/api-key`
- `GET /api/admin/qa-lab/api-key`

Uso esperado:

- La UI muestra key enmascarada por defecto.
- El admin usa accion explicita de revelar/copiar.
- Cada revelado queda auditado.

## Seed (flujo seguro)

- Seed oficial: `prisma/seed.ts`.
- Crea/actualiza usuario `admin`.
- Si `SEED_ADMIN_PASSWORD` no existe, genera password temporal aleatoria y la imprime.
- No existe flujo de seed inseguro con password hardcodeada.

## Hardening Supabase

Aplicar lockdown general:

```bash
npm run security:lockdown
```

Verificar en Supabase SQL Editor:

- `scripts/supabase_verify_rls.sql`

Si aparece warning especifico de `qa_lab_config`:

- Ejecutar `scripts/supabase_fix_qa_lab_config_rls.sql`

## Validaciones

Comandos recomendados:

```bash
npm run typecheck
npm run lint
npm run test:security
npm run test
npm run build
```
