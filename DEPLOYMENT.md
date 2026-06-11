# Timesheet Application - Deployment Guide

## 🚀 Pasul 1: Pregătire Locală

### Cerințe:
- Node.js (v14+) - descarcă de la https://nodejs.org
- MongoDB - descarcă de la https://www.mongodb.com/try/download/community
- Git (opțional)

### Instalare Locală:

1. **Deschide Terminal/Command Prompt** și navighează în folderul aplicației
2. **Instalează dependențele:**
   ```bash
   npm install
   ```

3. **Pornire server local:**
   ```bash
   npm start
   ```
   Server va rula pe `http://localhost:3000`

4. **Accesează aplicația:**
   - Employee: `http://localhost:3000`
   - Manager: `http://localhost:3000/manager.html`

---

## 🌐 Pasul 2: Deploy pe Internet (3 Optiuni)

### OPTIUNE 1: Heroku (Recomandată pentru începători) ⭐

**Pasul 1: Crează cont pe Heroku**
- Mergi la https://www.heroku.com
- Click "Sign Up" și înregistrează-te

**Pasul 2: Instalează Heroku CLI**
- Descarcă de la https://devcenter.heroku.com/articles/heroku-cli
- Instalează și redeschide Terminal

**Pasul 3: Configurare**

```bash
# Login cu contul Heroku
heroku login

# Crează aplicație pe Heroku
heroku create timesheet-app-tunum

# Configurează variabilele de mediu
heroku config:set MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/timesheet
heroku config:set JWT_SECRET=my-super-secret-key-change-this

# Deploy
git push heroku main
```

**Link Final:** `https://timesheet-app-tunum.herokuapp.com`

---

### OPTIUNE 2: Render.com (Ușor și Gratuit) ⭐⭐

**Pasul 1: Crează cont**
- Mergi la https://render.com
- Sign up cu email

**Pasul 2: Crează New Web Service**
- Click "New +" → "Web Service"
- Conectează GitHub (dacă ai repo)

**Pasul 3: Configurare**
- Name: `timesheet-app`
- Build Command: `npm install`
- Start Command: `npm start`
- Add Environment Variables:
  ```
  MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/timesheet
  JWT_SECRET=my-secret-key
  NODE_ENV=production
  ```

**Link Final:** `https://timesheet-app.onrender.com`

---

### OPTIUNE 3: Railway (Modern și Simplu)

**Pasul 1: Sign Up**
- Mergi la https://railway.app
- Conectează GitHub

**Pasul 2: Deploy**
- Crează New Project
- Selectează GitHub repo
- Railway va detecta automat Node.js

**Pasul 3: Configurare**
- Adaugă variabilele de mediu în Project Settings

**Link Final:** `https://timesheet-app.railway.app`

---

## 📊 Pasul 3: Setup Bază de Date MongoDB

Trebuie o bază de date online (pentru ca app să funcționeze din afară).

### Opțiunea A: MongoDB Atlas (Gratuit) ✅

1. Mergi la https://www.mongodb.com/cloud/atlas
2. Click "Sign Up"
3. Crează un cluster GRATUIT (M0)
4. Obține connection string (arată așa):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/timesheet
   ```
5. Adaugă în variabilele de mediu: `MONGODB_URI`

### Opțiunea B: MongoDB Local (Doar dacă Server-ul e local)

Dacă ești pe VPS/Server dedicat, poti instala MongoDB direct.

---

## 🔐 Setup Siguranță

### Înainte de Deploy în Producție:

1. **Schimbă JWT_SECRET** în `.env`:
   ```
   JWT_SECRET=generează-o-random-cu-caractere-lungi
   ```

2. **Adaugă CORS corect** (schimbă http://localhost:3000 cu domain-ul tău):
   ```javascript
   app.use(cors({
     origin: 'https://your-domain.com'
   }));
   ```

3. **Activează HTTPS** - toate platformele o fac automat

---

## 📱 Conturile Demo

Creează conturi de test:

**Employee Account:**
- Email: `ion@company.com`
- Password: `password123`
- Role: employee

**Manager Account:**
- Email: `manager@company.com`
- Password: `password123`
- Role: manager

---

## 🆘 Troubleshooting

### "Cannot connect to MongoDB"
- Verifica connection string
- Verifica dacă IP-ul tău e whitelisted în MongoDB Atlas
- Verifica username/password

### "CORS Error"
- Asigură-te că API_URL din frontend e correct
- Verifica origin în CORS settings din server.js

### "Port 3000 already in use"
- Schimbă PORT în .env: `PORT=3001`

### "Deploy failed"
- Verifica log-urile (Heroku: `heroku logs --tail`)
- Asigură-te că package.json are start script

---

## 📈 Scalare Viitoare

Când crește traficul:

1. **Upgrade MongoDB** de la M0 la M2+ pe Atlas
2. **Upgrade server** pe Heroku/Render
3. **Adaugă Redis** pentru caching
4. **Gestionare sesiuni** cu Redis

---

## 📞 Support Urls

- Heroku Docs: https://devcenter.heroku.com
- Render Docs: https://docs.render.com
- MongoDB Atlas: https://docs.atlas.mongodb.com
- Node.js: https://nodejs.org/docs

---

## ✅ Checklist Deployment

- [ ] Creat cont pe hosting platform
- [ ] Instalat MongoDB (local sau cloud)
- [ ] Generat JWT_SECRET secure
- [ ] Setat MONGODB_URI
- [ ] Testat local: `npm start`
- [ ] Deploy pe platform (Heroku/Render/Railway)
- [ ] Testat pe domeniu online
- [ ] Creat conturi employee + manager
- [ ] Testat Check In/Check Out
- [ ] Testat Manager Approvals

---

Aplicația este gata! 🎉
