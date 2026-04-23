# 🚀 FuelTrack — Deploy na Vercel (Guia Completo)

## Visão Geral

Você vai criar **dois projetos** na Vercel:
1. **Backend** → pasta `ft/backend` (Laravel + PHP)
2. **Frontend** → pasta `ft/frontend` (Angular)

---

## 📋 PASSO 1 — Suba o código no GitHub

1. Extraia o ZIP localmente
2. Crie um repositório no GitHub (pode ser privado)
3. Suba a pasta `ft/` inteira:

```bash
cd ft
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/SEU_USUARIO/fueltrack.git
git push -u origin main
```

---

## 🖥️ PASSO 2 — Deploy do Backend (Laravel)

### 2.1 — Crie o projeto na Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Importe o repositório do GitHub
3. **⚠️ IMPORTANTE:** Em "Root Directory", clique em **Edit** e coloque: `ft/backend`
4. Framework Preset: **Other**
5. Clique em **Deploy** (vai falhar, mas está OK — configure as variáveis abaixo primeiro)

### 2.2 — Configure as Variáveis de Ambiente

No painel do projeto backend → **Settings → Environment Variables**, adicione:

| Variável | Valor |
|----------|-------|
| `APP_KEY` | `base64:3MO34EbiFPYtX4TNdxG8qTBrIqOZd28Wglr6hgucq8U=` |
| `JWT_SECRET` | `630853e82799bb48d68a436705560fb4661f08052322c51142dab1dce5c117b2` |
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `LOG_CHANNEL` | `stderr` |
| `DB_CONNECTION` | `pgsql` |
| `DB_HOST` | `ep-quiet-sky-an30vpqk-pooler.c-6.us-east-1.aws.neon.tech` |
| `DB_PORT` | `5432` |
| `DB_DATABASE` | `neondb` |
| `DB_USERNAME` | `neondb_owner` |
| `DB_PASSWORD` | `npg_bFfmWO0xN5vY` |
| `DB_SSLMODE` | `require` |
| `CORS_ALLOWED_ORIGINS` | `*` ← use `*` por ora; depois troque pela URL do frontend |

### 2.3 — Faça o Redeploy

Após salvar as variáveis: **Deployments → (último deploy) → Redeploy**

Anote a URL do backend, ex: `https://fueltrack-api.vercel.app`

---

## 🎨 PASSO 3 — Ajuste o Frontend antes do deploy

Antes de deployar o frontend, **edite** o arquivo:

**`ft/frontend/src/environments/environment.production.ts`**

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://SEU-BACKEND.vercel.app/api'   // ← URL do backend que você anotou
};
```

Faça commit e push dessa alteração:

```bash
git add ft/frontend/src/environments/environment.production.ts
git commit -m "update api url"
git push
```

---

## 🌐 PASSO 4 — Deploy do Frontend (Angular)

1. Na Vercel → **Add New Project** → mesmo repositório
2. **Root Directory:** `ft/frontend`
3. Framework: **Other** (o `vercel.json` já define tudo)
4. O build command já está configurado: `npm run build:prod`
5. O output directory já está configurado: `dist/fueltrack/browser`
6. Clique em **Deploy**

Anote a URL do frontend, ex: `https://fueltrack.vercel.app`

---

## 🔗 PASSO 5 — Ajuste o CORS no Backend

Após ter a URL do frontend, volte ao projeto do **backend** na Vercel:

**Settings → Environment Variables → CORS_ALLOWED_ORIGINS**

Troque `*` pela URL real do frontend:
```
https://fueltrack.vercel.app
```

Faça **Redeploy** do backend.

---

## 🗄️ PASSO 6 — Rodar as Migrations (banco de dados)

O banco Neon já está configurado. Você precisa rodar as migrations **uma vez**.

**Opção A — Via Vercel CLI (recomendado):**

```bash
npm i -g vercel
vercel login
vercel env pull .env.local    # baixa as variáveis do backend
cd ft/backend
composer install
php artisan migrate --seed    # cria tabelas + usuário admin
```

**Opção B — Localmente com .env configurado:**

```bash
cd ft/backend
cp .env.example .env
# edite .env com as credenciais do Neon (já estão no .env.example)
composer install
php artisan key:generate
php artisan jwt:secret
php artisan migrate --seed
```

Isso cria as tabelas e o usuário padrão:
- **Login:** `admin`
- **Senha:** `admin123`

---

## ✅ Checklist Final

- [ ] Backend deployado e respondendo em `/api/up`
- [ ] `CORS_ALLOWED_ORIGINS` apontando para a URL do frontend
- [ ] `environment.production.ts` com a URL correta do backend
- [ ] Frontend deployado e carregando
- [ ] Migrations rodadas (tabelas criadas)
- [ ] Login funcionando com `admin` / `admin123`

---

## 🐛 Problemas Comuns

### "500 Internal Server Error" no backend
→ Verifique se `APP_KEY` e `JWT_SECRET` estão nas variáveis de ambiente da Vercel

### "CORS error" no frontend
→ Verifique `CORS_ALLOWED_ORIGINS` no backend — deve ser a URL exata do frontend

### "Connection refused" no banco
→ O Neon requer `DB_SSLMODE=require` — confirme que está nas variáveis

### Frontend mostra tela em branco
→ Verifique se `apiUrl` no `environment.production.ts` está correto e foi feito push antes do deploy

### PHP runtime error na Vercel
→ O `vercel.json` do backend usa `vercel-php@0.7.1` — é compatível com PHP 8.2+. Se der erro, tente mudar para `vercel-php@0.6.0`

---

## 🔑 Chaves Geradas (guarde em local seguro)

```
APP_KEY=base64:3MO34EbiFPYtX4TNdxG8qTBrIqOZd28Wglr6hgucq8U=
JWT_SECRET=630853e82799bb48d68a436705560fb4661f08052322c51142dab1dce5c117b2
```
