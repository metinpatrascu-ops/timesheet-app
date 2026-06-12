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
  breaks: [{
    start: Date,
    end: Date,
    duration: Number
  }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedBy: mongoose.Schema.Types.ObjectId,
  approvedAt: Date,
  notes: String,
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Timesheet = mongoose.model('Timesheet', timesheetSchema);
const Notification = mongoose.model('Notification', notificationSchema);

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

    const { date, status } = req.query;
    const query = {};

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (status) query.status = status;

    const timesheets = await Timesheet.find(query)
      .populate('userId', 'name email')
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
    const { date, checkIn, checkOut, notes } = req.body;
    const roOffset2 = (() => { const d = new Date(date+'T12:00:00Z'); const l = new Date(d.toLocaleString('en-US',{timeZone:'Europe/Bucharest'})); const h = Math.round((l-d)/3600000); return (h>=0?'+':'-')+String(Math.abs(h)).padStart(2,'0')+':00'; })();
    const checkInDate = new Date(`${date}T${checkIn}:00${roOffset2}`);
    const checkOutDate = new Date(`${date}T${checkOut}:00${roOffset2}`);
    const totalHours = Math.round(((checkOutDate - checkInDate) / (1000 * 60 * 60)) * 2) / 2;
    const ts = await Timesheet.findByIdAndUpdate(req.params.id,
      { checkIn: checkInDate, checkOut: checkOutDate, totalHours, notes: notes || '', status: 'approved', approvedBy: req.userId, approvedAt: new Date() },
      { new: true }
    );
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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Keep-alive: ping self every 14 min to prevent Render free tier sleep
  const SELF = process.env.APP_URL || 'https://timesheet-app-qbdt.onrender.com';
  setInterval(() => { fetch(`${SELF}/api/health`).catch(() => {}); }, 14 * 60 * 1000);
});
