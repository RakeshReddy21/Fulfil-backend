const Webhook = require('../models/Webhook');
const axios = require('axios');

async function triggerWebhooks(eventType, data, userId) {
  try {
    const webhooks = await Webhook.find({
      eventType: eventType,
      enabled: true,
      createdBy: userId
    });

    const promises = webhooks.map(async (webhook) => {
      const startTime = Date.now();
      try {
        const response = await axios.post(webhook.url, {
          event: eventType,
          data: data,
          timestamp: new Date().toISOString()
        }, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhook.secret || ''
          }
        });

        webhook.lastTriggered = new Date();
        webhook.lastResponseCode = response.status;
        webhook.lastResponseTime = Date.now() - startTime;
        await webhook.save();

        return { success: true, webhookId: webhook._id, statusCode: response.status };
      } catch (error) {
        webhook.lastTriggered = new Date();
        webhook.lastResponseCode = error.response?.status || 0;
        webhook.lastResponseTime = Date.now() - startTime;
        await webhook.save();

        return { 
          success: false, 
          webhookId: webhook._id, 
          error: error.message,
          statusCode: error.response?.status || 0
        };
      }
    });

    return await Promise.allSettled(promises);
  } catch (error) {
    console.error('Error triggering webhooks:', error);
    return [];
  }
}

async function testWebhook(webhookId, userId) {
  try {
    const webhook = await Webhook.findOne({
      _id: webhookId,
      createdBy: userId
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const startTime = Date.now();
    try {
      const response = await axios.post(webhook.url, {
        event: 'webhook.test',
        data: { message: 'This is a test webhook' },
        timestamp: new Date().toISOString()
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret || ''
        }
      });

      webhook.lastTriggered = new Date();
      webhook.lastResponseCode = response.status;
      webhook.lastResponseTime = Date.now() - startTime;
      await webhook.save();

      return {
        success: true,
        statusCode: response.status,
        responseTime: webhook.lastResponseTime,
        message: 'Webhook triggered successfully'
      };
    } catch (error) {
      webhook.lastTriggered = new Date();
      webhook.lastResponseCode = error.response?.status || 0;
      webhook.lastResponseTime = Date.now() - startTime;
      await webhook.save();

      return {
        success: false,
        statusCode: error.response?.status || 0,
        responseTime: webhook.lastResponseTime,
        error: error.message
      };
    }
  } catch (error) {
    throw error;
  }
}

module.exports = {
  triggerWebhooks,
  testWebhook
};


