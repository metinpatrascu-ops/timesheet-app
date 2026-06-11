# 📊 Timesheet Management System

O aplicație completă de gestionare a orelor lucrate cu sistem de aprobări pentru manager.

## ✨ Funcții

### Pentru Angajați:
- ✅ Check In / Check Out
- ✅ Gestionare Pauze
- ✅ Calendar cu Istoric
- ✅ Status Aprobări în Timp Real
- ✅ Sincronizare Live

### Pentru Manager:
- ✅ Aproba / Respinge Zile
- ✅ Dashboard cu Statistici
- ✅ Rapoarte Echipă
- ✅ Gestionare Angajați
- ✅ Vizualizare Ore pe Angajat

## 🚀 Quick Start (Locală)

### 1. Instalează dependențele:
```bash
npm install
```

### 2. Pornește serverul:
```bash
npm start
```

### 3. Accesează aplicația:
- **Employee**: http://localhost:3000
- **Manager**: http://localhost:3000/manager.html

## 📦 Tehnologii

- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Authentication**: JWT
- **Frontend**: HTML5 + CSS3 + JavaScript Vanilla

## 📁 Structură Proiect

```
timesheet-app/
├── server.js              # Server principal
├── package.json           # Dependențe
├── .env                   # Variabile de mediu
├── DEPLOYMENT.md          # Ghid deploy
├── README.md              # Acest fișier
└── public/
    ├── index.html         # App Angajat
    └── manager.html       # Dashboard Manager
```

## 🔧 Configurare

Editează `.env`:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/timesheet
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - Înregistrare
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - User curent

### Timesheet
- `POST /api/timesheet/checkin` - Check In
- `POST /api/timesheet/checkout` - Check Out
- `GET /api/timesheet/today` - Azi
- `GET /api/timesheet/history` - Istoric

### Pauze
- `POST /api/timesheet/break/start` - Incepe pauza
- `POST /api/timesheet/break/end` - Termina pauza

### Manager
- `GET /api/manager/pending-approvals` - Zile în așteptare
- `POST /api/manager/approve/:id` - Aprobă
- `POST /api/manager/reject/:id` - Respinge
- `GET /api/manager/team-timesheets` - Echipă

## 👥 Conturi Test

**Employee:**
- Email: `emp@test.com`
- Password: `test123`

**Manager:**
- Email: `manager@test.com`
- Password: `test123`

## 🌐 Deploy

Pentru a pune aplicația **ONLINE**, urmărește ghidul complet din `DEPLOYMENT.md`.

Opțiuni rapide:
1. **Heroku** - Click and Deploy
2. **Render.com** - Gratuit și ușor
3. **Railway** - Modern și rapid
4. **VPS** - Plin control

## 🐛 Development

Pentru development cu auto-reload:
```bash
npm run dev
```

## 📄 Licență

MIT

## 📞 Support

Pentru probleme, verifica:
1. `.env` configurare
2. MongoDB conexiune
3. Port-uri disponibile
4. Firewall rules

---

**Status**: ✅ Production Ready

Aplicația poate fi pusă imediat în producție!
