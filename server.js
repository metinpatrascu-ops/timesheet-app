const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

async function brevoSend(to, toName, subject, html) {
  if (!process.env.BREVO_PASS) return;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_PASS,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Timesheet App', email: 'metinpatrascu@gmail.com' },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: html
      })
    });
    if (!res.ok) console.error('Brevo error:', await res.text());
  } catch (err) {
    console.error('Brevo fetch error:', err.message);
  }
}

async function sendNotifEmail(to, name, subject, bodyHtml) {
  const appUrl = process.env.APP_URL || 'https://timesheet-app-qbdt.onrender.com';
  brevoSend(to, name, subject, `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
    <h2 style="color:#3498db;">Salut, ${name}!</h2>
    ${bodyHtml}
    <a href="${appUrl}" style="background:#3498db;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">Vezi în aplicație</a>
  </div>`);
}

async function sendWelcomeEmail(to, name, password) {
  const appUrl = process.env.APP_URL || 'https://timesheet-app-qbdt.onrender.com';
  brevoSend(to, name, 'Contul tău Timesheet a fost creat',
    `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
      <h2 style="color:#3498db;">Bun venit, ${name}!</h2>
      <p>Managerul tău ți-a creat un cont în aplicația de pontaj.</p>
      <div style="background:#f9f9f9;padding:15px;border-radius:8px;margin:20px 0;">
        <p><strong>Email:</strong> ${to}</p>
        <p><strong>Parolă:</strong> ${password}</p>
      </div>
      <a href="${appUrl}" style="background:#27ae60;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:10px;">Accesează aplicația</a>
      <p style="color:#999;font-size:12px;margin-top:20px;">Te rugăm să îți schimbi parola după prima autentificare.</p>
    </div>`
  );
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/timesheet';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: String,
  position: String,
  role: { type: String, enum: ['employee', 'manager', 'admin'], default: 'employee' },
  createdAt: { type: Date, default: Date.now }
});

const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  checkIn: Date,
  checkOut: Date,
  totalHours: Number,
  extraHours: Number,
  extraNotes: String,
  breaks: [{
    start: Date,
    end: Date,
    duration: Number
  }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: mongoose.Schema.Types.ObjectId,
  approvedAt: Date,
  notes: String,
  isEvent: { type: Boolean, default: false },
  eventName: String,
  dayType: { type: String, enum: ['normal', 'sick', 'noshow'], default: 'normal' },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const leaveSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  type: { type: String, default: 'Concediu de odihnă' },
  notes: String,
  createdAt: { type: Date, default: Date.now }
});

const tempEmailSchema = new mongoose.Schema({
  address: { type: String, unique: true, required: true },
  token: { type: String, required: true },
  sendCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});

const User = mongoose.model('User', userSchema);
const Timesheet = mongoose.model('Timesheet', timesheetSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Leave = mongoose.model('Leave', leaveSchema);
const TempEmail = mongoose.model('TempEmail', tempEmailSchema);

// Helper function to generate JWT
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
};

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Routes
// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      name: name || email.split('@')[0],
      role: role || 'employee'
    });

    await user.save();
    const token = generateToken(user._id);

    res.json({
      message: 'User registered successfully',
      token,
      user: { id: user._id, email: user.email, name: user.name, position: user.position, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, email: user.email, name: user.name, position: user.position, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ user: { id: user._id, email: user.email, name: user.name, position: user.position, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check In
app.post('/api/timesheet/checkin', verifyToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let timesheet = await Timesheet.findOne({
      userId: req.userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
    });

    if (!timesheet) {
      timesheet = new Timesheet({
        userId: req.userId,
        date: new Date(),
        checkIn: new Date()
      });
    } else {
      timesheet.checkIn = new Date();
    }

    await timesheet.save();
    res.json({ message: 'Check in successful', timesheet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check Out
app.post('/api/timesheet/checkout', verifyToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const timesheet = await Timesheet.findOne({
      userId: req.userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
    });

    if (!timesheet || !timesheet.checkIn) {
      return res.status(400).json({ error: 'No check in found' });
    }

    timesheet.checkOut = new Date();
    
    // Calculate total hours
    let totalMs = timesheet.checkOut - timesheet.checkIn;
    if (timesheet.breaks && timesheet.breaks.length > 0) {
      timesheet.breaks.forEach(br => {
        totalMs -= (br.end - br.start);
      });
    }
    timesheet.totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 2) / 2;

    await timesheet.save();
    res.json({ message: 'Check out successful', timesheet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add break
app.post('/api/timesheet/break/start', verifyToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const timesheet = await Timesheet.findOne({
      userId: req.userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
    });

    if (!timesheet) {
      return res.status(400).json({ error: 'No timesheet for today' });
    }

    timesheet.currentBreakStart = new Date();
    await timesheet.save();

    res.json({ message: 'Break started', timesheet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End break
app.post('/api/timesheet/break/end', verifyToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const timesheet = await Timesheet.findOne({
      userId: req.userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
    });

    if (!timesheet || !timesheet.currentBreakStart) {
      return res.status(400).json({ error: 'No break in progress' });
    }

    const breakEnd = new Date();
    const duration = (breakEnd - timesheet.currentBreakStart) / (1000 * 60); // in minutes

    if (!timesheet.breaks) timesheet.breaks = [];
    timesheet.breaks.push({
      start: timesheet.currentBreakStart,
      end: breakEnd,
      duration: Math.round(duration)
    });

    timesheet.currentBreakStart = null;
    await timesheet.save();

    res.json({ message: 'Break ended', timesheet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get today's timesheet
app.get('/api/timesheet/today', verifyToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const timesheet = await Timesheet.findOne({
      userId: req.userId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
    });

    res.json({ timesheet: timesheet || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all timesheets for a user (with pagination)
// Employee: get own event days + bonus
app.get('/api/timesheet/my-events', verifyToken, async (req, res) => {
  try {
    const events = await Timesheet.find({ userId: req.userId, isEvent: true }).sort({ date: -1 });
    const PAY_PER_EVENT = 250;
    res.json({ events, total: events.length, bonus: events.length * PAY_PER_EVENT, payPerEvent: PAY_PER_EVENT });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/timesheet/history', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (page - 1) * limit;

    const timesheets = await Timesheet.find({ userId: req.userId })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Timesheet.countDocuments({ userId: req.userId });

    res.json({
      timesheets,
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Get all timesheets pending approval
app.get('/api/manager/pending-approvals', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const timesheets = await Timesheet.find({ status: 'pending' })
      .populate('userId', 'name email')
      .sort({ date: -1 });

    res.json({ timesheets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Approve timesheet
app.post('/api/manager/approve/:timesheetId', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const timesheet = await Timesheet.findByIdAndUpdate(
      req.params.timesheetId,
      { status: 'approved', approvedBy: req.userId, approvedAt: new Date() },
      { new: true }
    );

    const employee = await User.findById(timesheet.userId);
    if (employee) {
      const dateStr = new Date(timesheet.date).toLocaleDateString('ro-RO');
      const msg = `Ziua ta de muncă din ${dateStr} a fost aprobată de manager.`;
      await Notification.create({ userId: employee._id, message: msg });
      sendNotifEmail(employee.email, employee.name, `Zi aprobată — ${dateStr}`,
        `<p>Ziua ta de muncă din <strong>${dateStr}</strong> a fost <span style="color:#27ae60;font-weight:bold;">aprobată</span>.</p>
         <p>Ore lucrate: <strong>${timesheet.totalHours || 0}h</strong></p>`
      );
    }

    res.json({ message: 'Timesheet approved', timesheet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Reject timesheet
app.post('/api/manager/reject/:timesheetId', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const timesheet = await Timesheet.findByIdAndUpdate(
      req.params.timesheetId,
      { status: 'rejected', notes: req.body.notes || '' },
      { new: true }
    );

    const employee = await User.findById(timesheet.userId);
    if (employee) {
      const dateStr = new Date(timesheet.date).toLocaleDateString('ro-RO');
      const motiv = req.body.notes ? `Motiv: ${req.body.notes}` : '';
      const msg = `Ziua ta de muncă din ${dateStr} a fost respinsă. ${motiv}`;
      await Notification.create({ userId: employee._id, message: msg });
      sendNotifEmail(employee.email, employee.name, `Zi respinsă — ${dateStr}`,
        `<p>Ziua ta de muncă din <strong>${dateStr}</strong> a fost <span style="color:#e74c3c;font-weight:bold;">respinsă</span>.</p>
         ${req.body.notes ? `<p>Motiv: <em>${req.body.notes}</em></p>` : ''}`
      );
    }

    res.json({ message: 'Timesheet rejected', timesheet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Get team timesheets
app.get('/api/manager/team-timesheets', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { date, status, month, year } = req.query;
    const query = {};

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    } else if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      query.date = {
        $gte: new Date(y, m, 1),
        $lt:  new Date(y, m + 1, 1)
      };
    }

    if (status) query.status = status;

    const timesheets = await Timesheet.find(query)
      .populate('userId', 'name email position')
      .sort({ date: -1 });

    res.json({ timesheets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all employees (admin only)
app.get('/api/admin/employees', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'admin' && user.role !== 'manager') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const employees = await User.find({ role: 'employee' }).select('-password');
    res.json({ employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Create employee account
app.post('/api/manager/create-employee', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { email, password, name, role, position } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name required' });
    }
    const newRole = (role === 'manager') ? 'manager' : 'employee';
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, name, position: (position || '').trim(), role: newRole });
    await newUser.save();
    res.json({ message: 'User created', user: { id: newUser._id, email: newUser.email, name: newUser.name, position: newUser.position, role: newUser.role } });
    sendWelcomeEmail(email, name, password);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Add timesheet entry manually for an employee
app.post('/api/manager/add-timesheet', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { employeeId, date, checkIn, checkOut, notes } = req.body;
    if (!employeeId || !date || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'employeeId, date, checkIn, checkOut required' });
    }

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    let timesheet = await Timesheet.findOne({
      userId: employeeId,
      date: { $gte: dateObj, $lt: new Date(dateObj.getTime() + 24*60*60*1000) }
    });

    const roOffset = (() => { const d = new Date(date+'T12:00:00Z'); const l = new Date(d.toLocaleString('en-US',{timeZone:'Europe/Bucharest'})); const h = Math.round((l-d)/3600000); return (h>=0?'+':'-')+String(Math.abs(h)).padStart(2,'0')+':00'; })();
    const checkInDate = new Date(`${date}T${checkIn}:00${roOffset}`);
    const checkOutDate = new Date(`${date}T${checkOut}:00${roOffset}`);
    const totalMs = checkOutDate - checkInDate;
    const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 2) / 2;

    if (timesheet) {
      timesheet.checkIn = checkInDate;
      timesheet.checkOut = checkOutDate;
      timesheet.totalHours = totalHours;
      timesheet.notes = notes || timesheet.notes;
      timesheet.status = 'approved';
      timesheet.approvedBy = req.userId;
      timesheet.approvedAt = new Date();
    } else {
      timesheet = new Timesheet({
        userId: employeeId,
        date: dateObj,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        totalHours,
        status: 'approved',
        approvedBy: req.userId,
        approvedAt: new Date(),
        notes: notes || ''
      });
    }
    await timesheet.save();

    const employee = await User.findById(employeeId);
    const msgText = `Managerul a adăugat/actualizat ziua de ${date}. Ore lucrate: ${totalHours}h. Status: Aprobat.`;

    Notification.create({ userId: employeeId, message: msgText }).catch(() => {});

    res.json({ message: 'Timesheet added', timesheet });

    // Send email in background (non-blocking)
    if (employee) {
      sendNotifEmail(employee.email, employee.name, `Program actualizat — ${date}`,
        `<p>Managerul tău a actualizat programul tău de lucru.</p>
         <div style="background:#f9f9f9;padding:15px;border-radius:8px;margin:16px 0;">
           <p><strong>Data:</strong> ${date}</p>
           <p><strong>Check In:</strong> ${checkIn}</p>
           <p><strong>Check Out:</strong> ${checkOut}</p>
           <p><strong>Total ore:</strong> ${totalHours}h</p>
           <p><strong>Status:</strong> ✅ Aprobat</p>
           ${notes ? `<p><strong>Note:</strong> ${notes}</p>` : ''}
         </div>`
      );
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Add extra hours (e.g. event work on a day off)
app.post('/api/manager/extra-hours', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { employeeId, date, hours, notes } = req.body;
    const hoursNum = parseFloat(hours);
    if (!employeeId || !date || !hoursNum || hoursNum <= 0) {
      return res.status(400).json({ error: 'employeeId, date și un număr de ore valid sunt obligatorii' });
    }

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    let timesheet = await Timesheet.findOne({
      userId: employeeId,
      date: { $gte: dateObj, $lt: new Date(dateObj.getTime() + 24*60*60*1000) }
    });

    if (timesheet) {
      timesheet.extraHours = (timesheet.extraHours || 0) + hoursNum;
      timesheet.extraNotes = [timesheet.extraNotes, notes].filter(Boolean).join(' | ');
    } else {
      timesheet = new Timesheet({
        userId: employeeId,
        date: dateObj,
        extraHours: hoursNum,
        extraNotes: notes || '',
        totalHours: 0,
        status: 'approved',
        approvedBy: req.userId,
        approvedAt: new Date(),
        notes: ''
      });
    }
    await timesheet.save();

    const employee = await User.findById(employeeId);
    const msgText = `Ți s-au adăugat ${hoursNum}h extra pentru ${date}${notes ? ` (${notes})` : ''}.`;
    Notification.create({ userId: employeeId, message: msgText }).catch(() => {});

    res.json({ message: 'Extra hours added', timesheet });

    if (employee) {
      sendNotifEmail(employee.email, employee.name, `Ore extra adăugate — ${date}`,
        `<p>Managerul tău ți-a adăugat <strong>ore extra</strong>.</p>
         <div style="background:#f9f9f9;padding:15px;border-radius:8px;margin:16px 0;">
           <p><strong>Data:</strong> ${date}</p>
           <p><strong>Ore extra:</strong> +${hoursNum}h</p>
           <p><strong>Total ore extra pe zi:</strong> ${timesheet.extraHours}h</p>
           ${notes ? `<p><strong>Motiv:</strong> ${notes}</p>` : ''}
         </div>`
      );
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Add leave (concediu) for an employee
app.post('/api/manager/leave', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { employeeId, startDate, endDate, type, notes } = req.body;
    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ error: 'employeeId, startDate, endDate required' });
    }
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ error: 'Data de sfârșit nu poate fi înainte de data de început' });
    }
    const leave = await Leave.create({
      userId: employeeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      type: type || 'Concediu de odihnă',
      notes: notes || ''
    });
    res.json({ message: 'Leave created', leave });

    const employee = await User.findById(employeeId);
    if (employee) {
      const s = new Date(startDate).toLocaleDateString('ro-RO');
      const e = new Date(endDate).toLocaleDateString('ro-RO');
      Notification.create({ userId: employee._id, message: `🏖 Concediu programat: ${s} – ${e} (${leave.type})` }).catch(() => {});
      sendNotifEmail(employee.email, employee.name, `Concediu programat — ${s} – ${e}`,
        `<p>Managerul ți-a programat <strong>${leave.type.toLowerCase()}</strong> în perioada:</p>
         <p style="font-size:18px;font-weight:bold;">${s} – ${e}</p>
         ${notes ? `<p>Note: <em>${notes}</em></p>` : ''}`
      );
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: List leaves
app.get('/api/manager/leaves', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const leaves = await Leave.find().populate('userId', 'name email position').sort({ startDate: -1 });
    res.json({ leaves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Delete leave
app.delete('/api/manager/leave/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const leave = await Leave.findByIdAndDelete(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    res.json({ message: 'Leave deleted' });

    const employee = await User.findById(leave.userId);
    if (employee) {
      const s = new Date(leave.startDate).toLocaleDateString('ro-RO');
      const e = new Date(leave.endDate).toLocaleDateString('ro-RO');
      Notification.create({ userId: employee._id, message: `Concediul din perioada ${s} – ${e} a fost anulat de manager.` }).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Update employee (name, position)
app.put('/api/manager/employee/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const updates = {};
    if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
    if (typeof req.body.position === 'string') updates.position = req.body.position.trim();
    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!updated) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee updated', employee: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Delete employee
app.delete('/api/manager/employee/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await User.findByIdAndDelete(req.params.id);
    await Timesheet.deleteMany({ userId: req.params.id });
    await Notification.deleteMany({ userId: req.params.id });
    await Leave.deleteMany({ userId: req.params.id });
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get notifications for current user
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manager: Set sick / noshow / normal on a timesheet day
app.post('/api/manager/timesheet/:id/daytype', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { dayType } = req.body;
    if (!['normal', 'sick', 'noshow'].includes(dayType)) return res.status(400).json({ error: 'dayType invalid' });
    const ts = await Timesheet.findById(req.params.id);
    if (!ts) return res.status(404).json({ error: 'Not found' });
    ts.dayType = dayType;
    await ts.save();
    res.json({ dayType: ts.dayType });
    const employee = await User.findById(ts.userId);
    if (employee && dayType !== 'normal') {
      const dateStr = new Date(ts.date).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const isSick = dayType === 'sick';
      sendNotifEmail(employee.email, employee.name,
        isSick ? `Zi de boală înregistrată — ${new Date(ts.date).toLocaleDateString('ro-RO')}` : `Absență nemotivată — ${new Date(ts.date).toLocaleDateString('ro-RO')}`,
        isSick
          ? `<p>Managerul a înregistrat <strong>zi de boală</strong> pentru tine pe data de:</p>
             <div style="background:#fff3cd;padding:14px;border-radius:8px;margin:16px 0;border-left:4px solid #f39c12;">
               <p style="font-size:18px;font-weight:bold;margin:0;">📅 ${dateStr}</p>
               <p style="margin:8px 0 0;color:#856404;">Status: 🤒 Concediu medical</p>
             </div>
             <p>Zi liberă — nicio acțiune necesară din partea ta.</p>`
          : `<p>Managerul a înregistrat o <strong>absență nemotivată</strong> pentru tine pe data de:</p>
             <div style="background:#f8d7da;padding:14px;border-radius:8px;margin:16px 0;border-left:4px solid #e74c3c;">
               <p style="font-size:18px;font-weight:bold;margin:0;">📅 ${dateStr}</p>
               <p style="margin:8px 0 0;color:#721c24;">Status: ❌ Absent nemotivat</p>
             </div>
             <p>Dacă crezi că este o eroare, contactează managerul.</p>`
      );
      const msg = isSick ? `Zi de boală înregistrată pentru ${new Date(ts.date).toLocaleDateString('ro-RO')}.` : `Absență nemotivată înregistrată pentru ${new Date(ts.date).toLocaleDateString('ro-RO')}.`;
      Notification.create({ userId: ts.userId, message: msg }).catch(() => {});
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manager: Toggle event flag on a timesheet
app.post('/api/manager/timesheet/:id/event', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const ts = await Timesheet.findById(req.params.id);
    if (!ts) return res.status(404).json({ error: 'Not found' });
    ts.isEvent = !ts.isEvent;
    ts.eventName = ts.isEvent ? (req.body.eventName || '').trim() || null : null;
    await ts.save();
    res.json({ isEvent: ts.isEvent, eventName: ts.eventName });

    if (ts.isEvent) {
      const PAY_PER_EVENT = 250;
      const [employee, allEvents] = await Promise.all([
        User.findById(ts.userId),
        Timesheet.find({ userId: ts.userId, isEvent: true }).sort({ date: 1 })
      ]);
      if (employee) {
        const total = allEvents.length;
        const totalPay = total * PAY_PER_EVENT;
        const dateStr = new Date(ts.date).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const eventsList = allEvents.map((e, i) =>
          `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 10px;">${i + 1}.</td>
            <td style="padding:6px 10px;">${new Date(e.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
            <td style="padding:6px 10px;color:#f39c12;font-weight:600;">${e.eventName || '—'}</td>
            <td style="padding:6px 10px;font-weight:600;color:#27ae60;">${PAY_PER_EVENT} lei</td>
          </tr>`
        ).join('');
        sendNotifEmail(employee.email, employee.name,
          `⭐ Eveniment înregistrat — bonus ${PAY_PER_EVENT} lei (total: ${totalPay} lei)`,
          `<p>Managerul a înregistrat participarea ta la un eveniment:</p>
           <div style="background:#fff8e6;padding:14px;border-radius:8px;margin:16px 0;border-left:4px solid #f39c12;">
             <p style="font-size:16px;font-weight:bold;margin:0;">⭐ ${ts.eventName || 'Eveniment'}</p>
             <p style="margin:6px 0 0;color:#856404;">📅 ${dateStr}</p>
           </div>
           <p style="font-size:15px;">Bonusul tău acumulat din evenimente:</p>
           <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:13px;">
             <thead>
               <tr style="background:#f9f9f9;">
                 <th style="padding:8px 10px;text-align:left;color:#666;">#</th>
                 <th style="padding:8px 10px;text-align:left;color:#666;">Data</th>
                 <th style="padding:8px 10px;text-align:left;color:#666;">Eveniment</th>
                 <th style="padding:8px 10px;text-align:left;color:#666;">Bonus</th>
               </tr>
             </thead>
             <tbody>${eventsList}</tbody>
             <tfoot>
               <tr style="background:#f0fdf4;">
                 <td colspan="3" style="padding:10px;font-weight:700;font-size:14px;">TOTAL ACUMULAT</td>
                 <td style="padding:10px;font-weight:700;font-size:16px;color:#27ae60;">${totalPay} lei</td>
               </tr>
             </tfoot>
           </table>
           <p style="color:#666;font-size:12px;">Bonusul se calculează automat: ${total} eveniment${total !== 1 ? 'e' : ''} × ${PAY_PER_EVENT} lei</p>`
        );
        Notification.create({ userId: ts.userId, message: `⭐ Eveniment înregistrat! Bonus acumulat: ${totalPay} lei (${total} evenimente × ${PAY_PER_EVENT} lei).` }).catch(() => {});
      }
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manager: Get all event timesheets (for the Events tab)
app.get('/api/manager/events', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const events = await Timesheet.find({ isEvent: true })
      .populate('userId', 'name email position')
      .sort({ date: -1 });
    res.json({ events });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manager: Delete a timesheet entry
app.delete('/api/manager/timesheet/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const ts = await Timesheet.findByIdAndDelete(req.params.id);
    if (!ts) return res.status(404).json({ error: 'Not found' });
    const employee = await User.findById(ts.userId);
    if (employee) {
      const dateStr = new Date(ts.date).toLocaleDateString('ro-RO');
      Notification.create({ userId: employee._id, message: `Ziua de muncă din ${dateStr} a fost ștearsă de manager.` }).catch(() => {});
      sendNotifEmail(employee.email, employee.name, `Zi ștearsă — ${dateStr}`,
        `<p>Managerul a șters ziua ta de muncă din <strong>${dateStr}</strong>.</p>`);
    }
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manager: Update a timesheet entry
app.put('/api/manager/timesheet/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'manager' && user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    const { date, checkIn, checkOut, notes, extraHours, extraNotes } = req.body;
    const roOffset2 = (() => { const d = new Date(date+'T12:00:00Z'); const l = new Date(d.toLocaleString('en-US',{timeZone:'Europe/Bucharest'})); const h = Math.round((l-d)/3600000); return (h>=0?'+':'-')+String(Math.abs(h)).padStart(2,'0')+':00'; })();
    const checkInDate = new Date(`${date}T${checkIn}:00${roOffset2}`);
    const checkOutDate = new Date(`${date}T${checkOut}:00${roOffset2}`);
    const totalHours = Math.round(((checkOutDate - checkInDate) / (1000 * 60 * 60)) * 2) / 2;
    const updateFields = { checkIn: checkInDate, checkOut: checkOutDate, totalHours, notes: notes || '', status: 'approved', approvedBy: req.userId, approvedAt: new Date() };
    if (extraHours !== undefined) updateFields.extraHours = Math.max(0, parseFloat(extraHours) || 0);
    if (extraNotes !== undefined) updateFields.extraNotes = extraNotes;
    const ts = await Timesheet.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    if (!ts) return res.status(404).json({ error: 'Not found' });
    const employee = await User.findById(ts.userId);
    if (employee) {
      const msgText = `Managerul a modificat ziua de ${date}. Ore lucrate: ${totalHours}h.`;
      Notification.create({ userId: employee._id, message: msgText }).catch(() => {});
      sendNotifEmail(employee.email, employee.name, `Program modificat — ${date}`,
        `<p>Managerul a modificat ziua ta de muncă din <strong>${date}</strong>.</p>
         <div style="background:#f9f9f9;padding:12px;border-radius:6px;margin:12px 0;">
           <p><strong>Check In:</strong> ${checkIn}</p>
           <p><strong>Check Out:</strong> ${checkOut}</p>
           <p><strong>Total ore:</strong> ${totalHours}h</p>
           ${notes ? `<p><strong>Note:</strong> ${notes}</p>` : ''}
         </div>`);
    }
    res.json({ message: 'Updated', timesheet: ts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark notification as read
app.post('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/test-email', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'manager' && user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_PASS, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Timesheet App', email: 'metinpatrascu@gmail.com' },
        to: [{ email: user.email, name: user.name }],
        subject: 'Test email Timesheet',
        htmlContent: '<p>Emailul functioneaza!</p>'
      })
    });
    const result = await r.json();
    res.json({ ok: r.ok, status: r.status, result });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

function buildProfessionalEmail(subject, body) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Split into paragraphs (double newline = new paragraph, single = <br>)
  const blocks = body.split(/\n{2,}/);
  const paragraphsHtml = blocks.map(block => {
    const lines = block.split('\n');
    const linesHtml = lines.map(line => {
      const t = esc(line.trim());
      if (!t) return '';
      // Salutation lines (Stimate, Bună, Salut, Dear)
      if (/^(Stimate|Stimată|Bună ziua|Bună|Salut|Dear|Hello)/i.test(line.trim()))
        return `<span style="font-weight:600;color:#1a1a2e;">${t}</span>`;
      // Sign-off lines (Cu stimă, Cu respect, Regards, etc.)
      if (/^(Cu stimă|Cu respect|Cu considerație|Regards|Best|Sincerely|Yours)/i.test(line.trim()))
        return `<span style="font-weight:600;color:#1a1a2e;">${t}</span>`;
      // List items starting with - or •
      if (/^[-•]\s/.test(line.trim()))
        return `<span style="display:block;padding-left:16px;color:#2d3748;">&#8226; ${t.replace(/^[-•]\s+/,'')}</span>`;
      // Numbered list
      if (/^\d+\.\s/.test(line.trim()))
        return `<span style="display:block;padding-left:16px;color:#2d3748;">${t}</span>`;
      // ALL CAPS lines (like NOTIFICARE, CERERE headers)
      if (t === t.toUpperCase() && t.length > 3 && /[A-ZĂÎÂȘȚ]/.test(t))
        return `<span style="font-weight:700;font-size:15px;letter-spacing:.05em;color:#1a1a2e;display:block;margin-bottom:2px;">${t}</span>`;
      return t;
    }).filter(Boolean).join('<br>');
    return `<p style="margin:0 0 18px 0;line-height:1.75;color:#2d3748;">${linesHtml}</p>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <!-- Top accent bar -->
        <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:28px 40px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.12em;color:#a0aec0;text-transform:uppercase;">Mesaj nou</p>
          <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.3;">${esc(subject)}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px 28px;">
          <div style="font-size:15px;">${paragraphsHtml}</div>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding:0 40px;">
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px 28px;">
          <p style="margin:0;font-size:11px;color:#a0aec0;line-height:1.6;">
            Acest email a fost generat automat.<br>
            Vă rugăm să nu răspundeți dacă nu aveți informații relevante.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Temp Email ────────────────────────────────────────────────────────────────
const crypto = require('crypto');

app.post('/api/tempemail/create', async (req, res) => {
  const { address } = req.body;
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return res.status(400).json({ error: 'Adresă email invalidă' });
  const existing = await TempEmail.findOne({ address });
  if (existing && existing.active)
    return res.status(409).json({ error: 'Această adresă e deja folosită' });
  if (existing) await TempEmail.deleteOne({ _id: existing._id });
  const token = crypto.randomBytes(24).toString('hex');
  await TempEmail.create({ address, token });
  res.json({ address, token, remaining: 5 });
});

app.post('/api/tempemail/send', async (req, res) => {
  const { address, token, to, subject, body } = req.body;
  if (!address || !token || !to || !subject || !body)
    return res.status(400).json({ error: 'Câmpuri lipsă' });
  const te = await TempEmail.findOne({ address, token });
  if (!te) return res.status(403).json({ error: 'Sesiune invalidă' });
  if (!te.active) return res.status(410).json({ error: 'Adresa a expirat' });
  if (te.sendCount >= 5) {
    te.active = false;
    await te.save();
    return res.status(410).json({ error: 'Limita de 5 emailuri atinsă' });
  }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': process.env.BREVO_PASS, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: '', email: 'noreply@flercafe.ro' },
        to: [{ email: to }],
        replyTo: { email: address },
        subject,
        htmlContent: buildProfessionalEmail(subject, body)
      })
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: 'Eroare Brevo: ' + t }); }
    te.sendCount += 1;
    if (te.sendCount >= 5) te.active = false;
    await te.save();
    res.json({ sent: true, remaining: 5 - te.sendCount, expired: !te.active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tempemail/delete', async (req, res) => {
  const { address, token } = req.body;
  const te = await TempEmail.findOne({ address, token });
  if (!te) return res.status(403).json({ error: 'Sesiune invalidă' });
  await TempEmail.deleteOne({ _id: te._id });
  res.json({ deleted: true });
});

app.get('/api/tempemail/status', async (req, res) => {
  const { address, token } = req.query;
  const te = await TempEmail.findOne({ address, token });
  if (!te) return res.status(403).json({ error: 'Sesiune invalidă' });
  res.json({ address: te.address, remaining: 5 - te.sendCount, active: te.active });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Keep-alive: ping self every 14 min to prevent Render free tier sleep
  const SELF = process.env.APP_URL || 'https://timesheet-app-qbdt.onrender.com';
  setInterval(() => { fetch(`${SELF}/api/health`).catch(() => {}); }, 14 * 60 * 1000);
});
