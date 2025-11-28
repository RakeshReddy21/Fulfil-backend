const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Validate required environment variables before starting
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these environment variables:');
  console.error('1. For local development: Create a .env file in the backend directory');
  console.error('2. For production (Render): Set them in Render Dashboard → Environment');
  console.error('\nExample .env file:');
  console.error('MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority');
  console.error('JWT_SECRET=your-secret-key-here');
  process.exit(1);
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
  
  res.json({ 
    status: dbStatus === 1 ? 'OK' : 'WARNING',
    message: 'Server is running',
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
    const jwt = require('jsonwebtoken');
    const User = require('./models/User');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// Wait for MongoDB connection before starting server
const connectDB = async () => {
  try {
    // Double-check MONGODB_URI is set (should already be validated above, but extra safety)
    if (!process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '') {
      throw new Error('MONGODB_URI is not set or is empty. Please set it in your environment variables.');
    }

    console.log('🔄 Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
    });

    console.log('✅ MongoDB Connected Successfully');
    
    // Only start server after MongoDB is connected
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('\n❌ MongoDB Connection Error:', err.message);
    console.error('\nPlease check:');
    console.error('1. MONGODB_URI is set correctly in environment variables');
    console.error('   - For local: Check your .env file in the backend directory');
    console.error('   - For Render: Go to Dashboard → Your Service → Environment');
    console.error('2. MongoDB Atlas IP whitelist includes 0.0.0.0/0 (all IPs) or Render IPs');
    console.error('3. MongoDB cluster is running and accessible');
    console.error('4. Network connectivity to MongoDB server');
    console.error('\nExample MONGODB_URI format:');
    console.error('mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority\n');
    process.exit(1);
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

// Start the connection process
connectDB();

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


