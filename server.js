const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Use environment variables with fallback values
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rkonda863_db_user:QDt5B6pCRJFcnd69@assignment.3ohuy8s.mongodb.net/?appName=assignment';
const JWT_SECRET = process.env.JWT_SECRET || 'jaNSCJnvcdjVNSJVNjvnivndsoivnkjdVN';
const PORT = process.env.PORT || 5000;

// Warn about missing required environment variables (but don't exit)
if (!MONGODB_URI) {
  console.warn('⚠️  WARNING: MONGODB_URI is not set. Database features will not work.');
  console.warn('   Set MONGODB_URI in your environment variables to enable database functionality.');
}

if (!JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET is not set. Authentication features will not work.');
  console.warn('   Set JWT_SECRET in your environment variables to enable authentication.');
  console.warn('   Generate one using: openssl rand -base64 32');
}

const app = express();

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware to check MongoDB connection before processing database requests
app.use('/api', (req, res, next) => {
  // Allow health check endpoint without DB connection
  if (req.path === '/health') {
    return next();
  }
  
  // Check if MongoDB is connected
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      error: 'Database not connected', 
      message: 'Please wait for the database connection to be established' 
    });
  }
  
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/webhooks', require('./routes/webhooks'));

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  const hasMongoDB = !!MONGODB_URI;
  const hasJWT = !!JWT_SECRET;
  
  res.json({ 
    status: (dbStatus === 1 && hasMongoDB && hasJWT) ? 'OK' : 'WARNING',
    message: 'Server is running',
    configuration: {
      mongodb_uri: hasMongoDB ? 'configured' : 'missing',
      jwt_secret: hasJWT ? 'configured' : 'missing'
    },
    database: {
      status: dbStates[dbStatus] || 'unknown',
      connected: dbStatus === 1
    }
  });
});

app.get('/api/jobs/:jobId/progress', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (!JWT_SECRET) {
      return res.status(503).json({ error: 'JWT_SECRET not configured' });
    }
    const jwt = require('jsonwebtoken');
    const User = require('./models/User');
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { jobId } = req.params;
  const { getJobStatus } = require('./utils/queue');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const interval = setInterval(async () => {
    try {
      const status = await getJobStatus(jobId);
      
      if (!status) {
        res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify(status)}\n\n`);

      if (status.state === 'completed' || status.state === 'failed') {
        clearInterval(interval);
        res.end();
      }
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Document Parsing API Server',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      documents: '/api/documents',
      users: '/api/users',
      products: '/api/products',
      webhooks: '/api/webhooks'
    }
  });
});

// Start server immediately so Render can detect the port
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Attempt MongoDB connection if URI is provided
  if (MONGODB_URI) {
    connectDB();
  } else {
    console.warn('⚠️  Skipping MongoDB connection - MONGODB_URI not set');
  }
});

// Connect to MongoDB (non-blocking)
const connectDB = async () => {
  try {
    if (!MONGODB_URI || MONGODB_URI.trim() === '') {
      console.warn('⚠️  MONGODB_URI is empty. Database features will not work.');
      return;
    }

    console.log('🔄 Attempting to connect to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    console.log('✅ MongoDB Connected Successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.error('Please check:');
    console.error('1. MONGODB_URI is set correctly in environment variables');
    console.error('   - For local: Check your .env file in the backend directory');
    console.error('   - For Render: Go to Dashboard → Your Service → Environment');
    console.error('2. MongoDB Atlas IP whitelist includes 0.0.0.0/0 (all IPs) or Render IPs');
    console.error('3. MongoDB cluster is running and accessible');
    console.error('4. Network connectivity to MongoDB server');
    console.error('\nExample MONGODB_URI format:');
    console.error('mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority');
    console.error('\n⚠️  Server will continue running, but database features will not work until MongoDB is connected.\n');
  }
};

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected successfully');
});

process.on('unhandledRejection', (error) => {
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    console.error('Database connection error:', error.message);
    return;
  }
  console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', (error) => {
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    console.error('Database connection error:', error.message);
    return;
  }
  console.error('Uncaught Exception:', error);
  process.exit(1);
});


