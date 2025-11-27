const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => {
    if (times > 3) {
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  enableOfflineQueue: false
};

let csvImportQueue = null;
let redisAvailable = false;
let redisWarningShown = false;
let queueInitialized = false;

async function checkRedisAvailable() {
  try {
    const redis = require('redis');
    let client = null;
    
    try {
      client = redis.createClient({
        socket: {
          host: redisConfig.host,
          port: redisConfig.port,
          connectTimeout: 1000
        }
      });
      
      client.on('error', () => {});
      
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
      ]);
      
      try {
        await client.quit();
      } catch (e) {
      }
      
      return true;
    } catch (err) {
      if (client) {
        try {
          await client.quit().catch(() => {});
        } catch (e) {
        }
      }
      return false;
    }
  } catch (err) {
    return false;
  }
}

async function initializeQueue() {
  if (queueInitialized) {
    return;
  }
  queueInitialized = true;

  const isRedisAvailable = await checkRedisAvailable();
  
  if (!isRedisAvailable) {
    if (!redisWarningShown) {
      console.warn('⚠️  Redis not available. CSV imports will be processed synchronously.');
      console.warn('   To enable async processing, install and start Redis:');
      console.warn('   sudo apt-get install redis-server && redis-server');
      redisWarningShown = true;
    }
    csvImportQueue = null;
    return;
  }

  try {
    const Bull = require('bull');
    csvImportQueue = new Bull('csv-import', {
      redis: redisConfig,
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 1
      }
    });

    csvImportQueue.on('error', (error) => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        csvImportQueue = null;
        return;
      }
      console.error('Queue error:', error);
    });

    csvImportQueue.on('ready', () => {
      redisAvailable = true;
      console.log('✅ Redis connected. Async queue processing enabled.');
    });

    csvImportQueue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err);
    });

    csvImportQueue.process(async (job) => {
      const { processCSVFile } = require('./csvProcessor');
      const { triggerWebhooks } = require('./webhookTrigger');
      const { filePath, userId } = job.data;
      
      const progressCallback = (processed) => {
        job.progress(processed);
      };

      try {
        const result = await processCSVFile(filePath, userId, progressCallback);
        
        await triggerWebhooks('product.bulk_import', {
          total: result.total,
          imported: result.imported,
          errors: result.errors
        }, userId);

        return result;
      } catch (error) {
        throw error;
      }
    });

    redisAvailable = true;
  } catch (error) {
    csvImportQueue = null;
    if (!redisWarningShown) {
      console.warn('⚠️  Queue initialization failed. CSV imports will be processed synchronously.');
      redisWarningShown = true;
    }
  }
}

setImmediate(() => {
  initializeQueue().catch(() => {
    csvImportQueue = null;
  });
});

async function addCSVImportJob(filePath, userId) {
  if (csvImportQueue === null) {
    await initializeQueue();
  }

  if (!csvImportQueue) {
    const { processCSVFile } = require('./csvProcessor');
    const { triggerWebhooks } = require('./webhookTrigger');
    
    const result = await processCSVFile(filePath, userId, () => {});
    
    await triggerWebhooks('product.bulk_import', {
      total: result.total,
      imported: result.imported,
      errors: result.errors
    }, userId);
    
    return {
      id: `sync-${Date.now()}`,
      returnvalue: result
    };
  }
  
  try {
    return await csvImportQueue.add({
      filePath,
      userId
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.message.includes('Redis')) {
      csvImportQueue = null;
      const { processCSVFile } = require('./csvProcessor');
      const { triggerWebhooks } = require('./webhookTrigger');
      
      const result = await processCSVFile(filePath, userId, () => {});
      await triggerWebhooks('product.bulk_import', {
        total: result.total,
        imported: result.imported,
        errors: result.errors
      }, userId);
      
      return {
        id: `sync-${Date.now()}`,
        returnvalue: result
      };
    }
    throw error;
  }
}

async function getJobStatus(jobId) {
  if (!csvImportQueue) {
    return null;
  }
  
  try {
    const job = await csvImportQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason
    };
  } catch (error) {
    console.error('Error getting job status:', error);
    return null;
  }
}

module.exports = {
  get csvImportQueue() { return csvImportQueue; },
  addCSVImportJob,
  getJobStatus
};


